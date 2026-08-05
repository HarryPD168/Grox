/**
 * Critical-path regression matrix for open-flash / catalog / upgrade force.
 * Pure unit pins — no Tauri. Maps to evidence fixes 0.2.24–0.2.30.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  insertLiveOnlyIntoOffline,
  mergeOfflineWithLive,
} from "./offlineMerge";
import { mergeProjectSessionsPure } from "./sessionCatalogMerge";
import {
  SHELL_VERSION_STORAGE_KEY,
  consumeShellUpgradeRescan,
  shouldForceOfflineRescan,
} from "./sessionOpenPolicy";
import { decideComputerAttachForPrompt } from "./computerUse";
import type { Session, SessionBlock } from "../bridge/types";

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

const cwdSame = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

describe("critical path matrix (open / catalog / force / CU)", () => {
  beforeEach(() => {
    localStorage.removeItem(SHELL_VERSION_STORAGE_KEY);
  });

  it("CP-01 upgrade pin → force once per session → second open skips", () => {
    expect(consumeShellUpgradeRescan("0.2.31")).toBe(true);
    const upgradeActive = true;
    const rescanned = new Set<string>();
    const force = (id: string) =>
      shouldForceOfflineRescan({
        upgradeRescanActive: upgradeActive,
        sessionAlreadyForceRescanned: rescanned.has(id),
      });
    expect(force("mission-1")).toBe(true);
    rescanned.add("mission-1");
    expect(force("mission-1")).toBe(false);
    expect(force("mission-2")).toBe(true);
  });

  it("CP-02 catalog union: new session does not hide same-cwd offline missions", () => {
    const cwd = "C:\\Users\\Harry_win10\\Desktop\\spoofer";
    const catalog = mergeProjectSessionsPure(
      [
        { id: "old-spoof", cwd, updatedAt: 100, title: "spoof" },
        { id: "old-greet", cwd, updatedAt: 90, title: "Greeting" },
      ],
      cwdSame,
      cwd,
      [{ id: "new-untitled", cwd, updatedAt: 200, title: "Untitled mission" }],
      new Set(),
    );
    expect(catalog.map((m) => m.id)).toEqual([
      "new-untitled",
      "old-spoof",
      "old-greet",
    ]);
  });

  it("CP-03 merge spine: 处理好了 before 你现在尝试 / Push (open flash order)", () => {
    const offline: SessionBlock[] = [
      { type: "user", id: "u-try", text: "你现在尝试", ts: 2 },
      {
        type: "assistant",
        id: "push",
        text: "# Push 成功\nok",
        ts: 3,
        streaming: false,
      },
    ];
    const live: SessionBlock[] = [
      { type: "user", id: "u-done", text: "处理好了，你现在尝试", ts: 1 },
      { type: "user", id: "u-try-live", text: "你现在尝试", ts: 2 },
      {
        type: "assistant",
        id: "push-live",
        text: "# Push 成功\nok",
        ts: 3,
        streaming: false,
      },
    ];
    const inserted = insertLiveOnlyIntoOffline(offline, live);
    const texts = inserted.map((b) => ("text" in b ? b.text : ""));
    expect(texts[0]).toContain("处理好了");
    expect(texts.indexOf("处理好了，你现在尝试")).toBeLessThan(
      texts.indexOf("你现在尝试"),
    );

    const merged = mergeOfflineWithLive(
      sess({ id: "s", status: "idle", blocks: offline }),
      sess({ id: "s", status: "idle", blocks: live }),
    );
    const mTexts = merged.blocks
      .filter((b) => b.type === "user" || b.type === "assistant")
      .map((b) => ("text" in b ? b.text : ""));
    expect(mTexts[0]).toContain("处理好了");
  });

  it("CP-04 CU: host opt-out revokes stale lease path (not already_attached)", () => {
    expect(
      decideComputerAttachForPrompt({
        requestsComputer: true,
        knownSession: true,
        optIn: false,
        hasActiveLease: true,
      }),
    ).toBe("revoke_stale_and_refuse");
  });

  it("CP-05 same shell version: no upgrade force generation", () => {
    localStorage.setItem(SHELL_VERSION_STORAGE_KEY, "0.2.31");
    expect(consumeShellUpgradeRescan("0.2.31")).toBe(false);
    expect(
      shouldForceOfflineRescan({
        upgradeRescanActive: false,
        sessionAlreadyForceRescanned: false,
      }),
    ).toBe(false);
  });
});
