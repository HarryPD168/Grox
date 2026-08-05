import { describe, expect, it } from "vitest";
import { blockContentKey, mergeOfflineWithLive } from "./offlineMerge";
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

describe("mergeOfflineWithLive", () => {
  it("keeps offline when live is empty", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [{ type: "user", id: "u1", text: "hi", ts: 1 }],
    });
    const out = mergeOfflineWithLive(pending, undefined);
    expect(out.blocks).toHaveLength(1);
    expect(out.status).toBe("idle");
  });

  it("appends live-only blocks after offline prefix", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [{ type: "user", id: "u1", text: "hi", ts: 1 }],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "u1", text: "hi", ts: 1 },
        { type: "user", id: "u2", text: "new", ts: 2 },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    // Live is authority for the tail — keeps both live blocks.
    expect(out.blocks.map((b) => b.id)).toEqual(["u1", "u2"]);
  });

  it("does not force idle while live turn is busy", () => {
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
    expect(out.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves awaiting_permission when disk is longer", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "u1", text: "hi", ts: 1 },
        { type: "user", id: "u2", text: "more", ts: 2 },
      ],
    });
    const cur = sess({
      id: "a",
      status: "awaiting_permission",
      blocks: [{ type: "user", id: "u1", text: "hi", ts: 1 }],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.status).toBe("awaiting_permission");
  });

  it("keeps live block identities when content matches (no remount flash)", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "disk-u1", text: "hello world", ts: 1 },
        { type: "assistant", id: "disk-a1", text: "hi there", ts: 2, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "uuid-u1", text: "hello world", ts: 1 },
        { type: "assistant", id: "uuid-a1", text: "hi there", ts: 2, streaming: false },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.blocks).toHaveLength(2);
    // Live authority: keep painted UUIDs.
    expect(out.blocks.map((b) => b.id)).toEqual(["uuid-u1", "uuid-a1"]);
  });

  it("prepends offline-only older history without replacing live tail (open flash)", () => {
    // Fingerprint painted recent turns; disk has older turns + same recent content.
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "disk-old", text: "ancient github", ts: 0 },
        { type: "assistant", id: "disk-old-a", text: "old reply", ts: 0.5, streaming: false },
        { type: "user", id: "disk-u1", text: "处理好了,你现在尝试", ts: 1 },
        { type: "assistant", id: "disk-a1", text: "Push 成功", ts: 2, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "uuid-u1", text: "处理好了,你现在尝试", ts: 1 },
        { type: "assistant", id: "uuid-a1", text: "Push 成功", ts: 2, streaming: false },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.blocks.map((b) => b.id)).toEqual([
      "disk-old",
      "disk-old-a",
      "uuid-u1",
      "uuid-a1",
    ]);
    // Tail must remain the painted Push content (not rewritten to disk ids).
    const last = out.blocks.at(-1);
    expect(last?.type).toBe("assistant");
    if (last?.type === "assistant") expect(last.text).toBe("Push 成功");
    expect(last?.id).toBe("uuid-a1");
  });

  it("keeps live trailing turn after offline prefix (content-aware)", () => {
    const pending = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "disk-u1", text: "old", ts: 1 },
        { type: "assistant", id: "disk-a1", text: "reply", ts: 2, streaming: false },
      ],
    });
    const cur = sess({
      id: "a",
      status: "idle",
      blocks: [
        { type: "user", id: "uuid-u1", text: "old", ts: 1 },
        { type: "assistant", id: "uuid-a1", text: "reply", ts: 2, streaming: false },
        { type: "user", id: "uuid-u2", text: "brand new", ts: 3 },
      ],
    });
    const out = mergeOfflineWithLive(pending, cur);
    expect(out.blocks.map((b) => (b.type === "user" || b.type === "assistant" ? b.text : b.id))).toEqual([
      "old",
      "reply",
      "brand new",
    ]);
    expect(out.blocks.map((b) => b.id)).toEqual(["uuid-u1", "uuid-a1", "uuid-u2"]);
  });

  it("blockContentKey distinguishes interjected users", () => {
    const a = blockContentKey({ type: "user", id: "1", text: "x", ts: 1 });
    const b = blockContentKey({ type: "user", id: "2", text: "x", ts: 1, interjected: true });
    expect(a).not.toBe(b);
  });
});
