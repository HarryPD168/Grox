import { describe, expect, it } from "vitest";
import {
  blockContentKey,
  firstPrimaryUserBlock,
  insertLiveOnlyIntoOffline,
  mergeOfflineWithLive,
} from "./offlineMerge";
import type { Session } from "../bridge/types";

function sess(
  partial: Partial<Session> & Pick<Session, "id" | "blocks" | "status">,
): Session {
  return {
    cwd: "C:\\proj",
    title: "t",
    createdAt: 0,
    updatedAt: 0,
    model: "test",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUSD: 0,
      contextUsed: 0,
      contextMax: 0,
      turns: 0,
    },
    ...partial,
  };
}

describe("mergeOfflineWithLive (0.2.24 evidence-driven)", () => {
  it("keeps offline when live is empty", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [{ type: "user", id: "u1", text: "hi", ts: 1 }],
    });
    const out = mergeOfflineWithLive(pending, undefined);
    expect(out.blocks.map((b) => b.id)).toEqual(["u1"]);
  });

  it("inserts live-only 处理好了 BEFORE shared 你现在尝试 (not after Push)", () => {
    // Real disk: updates has 你现在尝试 + Push; chat_history also has 处理好了 first.
    // Live paint (preview) has correct order including 处理好了 as live-only vs updates.
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "old", text: "ancient", ts: 1 },
        { type: "assistant", id: "old-a", text: "old reply", ts: 2, streaming: false },
        { type: "user", id: "u-try", text: "你现在尝试", ts: 3 },
        {
          type: "tool",
          id: "t1",
          ts: 4,
          call: {
            id: "call-164",
            kind: "execute",
            title: "run",
            status: "done",
            rawKind: "execute",
            startedAt: 4,
          },
        },
        { type: "assistant", id: "push", text: "# Push 成功\nok", ts: 5, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "live-done", text: "处理好了，你现在尝试", ts: 2 },
        { type: "user", id: "live-try", text: "你现在尝试", ts: 3 },
        {
          type: "tool",
          id: "live-t",
          ts: 4,
          call: {
            id: "call-164",
            kind: "execute",
            title: "run",
            status: "done",
            rawKind: "execute",
            startedAt: 4,
          },
        },
        { type: "assistant", id: "live-push", text: "# Push 成功\nok", ts: 5, streaming: false },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    const texts = out.blocks
      .filter((b) => b.type === "user" || b.type === "assistant")
      .map((b) => ("text" in b ? b.text : ""));
    expect(texts).toEqual([
      "ancient",
      "old reply",
      "处理好了，你现在尝试",
      "你现在尝试",
      "# Push 成功\nok",
    ]);
  });

  it("repairs corrupt live order when offline spine is correct (post-enrich)", () => {
    // Corrupt session-cache / memory: 你现在尝试 → Push → 处理好了
    // Offline after chat_history enrich: 处理好了 → 你现在尝试 → Push
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "off-done", text: "处理好了，你现在尝试", ts: 1 },
        { type: "user", id: "off-try", text: "你现在尝试", ts: 2 },
        { type: "assistant", id: "off-push", text: "# Push 成功\nok", ts: 3, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "live-try", text: "你现在尝试", ts: 2 },
        { type: "assistant", id: "live-push", text: "# Push 成功\nok", ts: 3, streaming: false },
        { type: "user", id: "live-done", text: "处理好了，你现在尝试", ts: 4 },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    const texts = out.blocks.map((b) => ("text" in b ? b.text : ""));
    expect(texts).toEqual(["处理好了，你现在尝试", "你现在尝试", "# Push 成功\nok"]);
    // Live identities reused where keys match
    expect(out.blocks[1]?.id).toBe("live-try");
    expect(out.blocks[2]?.id).toBe("live-push");
  });

  it("prepends older offline history before live window", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "old", text: "ancient github", ts: 1 },
        { type: "assistant", id: "old-a", text: "old", ts: 2, streaming: false },
        { type: "user", id: "u-try", text: "你现在尝试", ts: 3 },
        { type: "assistant", id: "push", text: "# Push 成功", ts: 4, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "uuid-try", text: "你现在尝试", ts: 3 },
        { type: "assistant", id: "uuid-push", text: "# Push 成功", ts: 4, streaming: false },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.blocks.map((b) => b.id)).toEqual([
      "old",
      "old-a",
      "uuid-try",
      "uuid-push",
    ]);
  });

  it("preserves busy status and live blocks", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [{ type: "user", id: "u1", text: "hi", ts: 1 }],
    });
    const cur = sess({
      id: "a",
      status: "running",
      blocks: [
        { type: "user", id: "u1", text: "hi", ts: 1 },
        { type: "assistant", id: "a1", text: "…", streaming: true, ts: 2 },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.status).toBe("running");
    expect(out.blocks.map((b) => b.id)).toEqual(["u1", "a1"]);
  });

  it("firstPrimaryUserBlock skips tools and interjects", () => {
    const blocks: Session["blocks"] = [
      {
        type: "tool",
        id: "t",
        ts: 1,
        call: {
          id: "c",
          kind: "execute",
          title: "x",
          status: "done",
          startedAt: 1,
        },
      },
      { type: "user", id: "i", text: "插话", ts: 2, interjected: true },
      { type: "user", id: "u", text: "主消息", ts: 3 },
    ];
    expect(firstPrimaryUserBlock(blocks)?.id).toBe("u");
  });

  it("blockContentKey distinguishes interjected users", () => {
    const a = blockContentKey({ type: "user", id: "1", text: "x", ts: 1 });
    const b = blockContentKey({ type: "user", id: "2", text: "x", ts: 1, interjected: true });
    expect(a).not.toBe(b);
  });

  it("insertLiveOnlyIntoOffline places user before next shared key", () => {
    const offline: Session["blocks"] = [
      { type: "user", id: "u-try", text: "你现在尝试", ts: 2 },
      { type: "assistant", id: "push", text: "# Push 成功", ts: 3, streaming: false },
    ];
    const live: Session["blocks"] = [
      { type: "user", id: "u-done", text: "处理好了，你现在尝试", ts: 1 },
      { type: "user", id: "u-try-live", text: "你现在尝试", ts: 2 },
      { type: "assistant", id: "push-live", text: "# Push 成功", ts: 3, streaming: false },
    ];
    const out = insertLiveOnlyIntoOffline(offline, live);
    expect(out.map((b) => ("text" in b ? b.text : ""))).toEqual([
      "处理好了，你现在尝试",
      "你现在尝试",
      "# Push 成功",
    ]);
  });
});
