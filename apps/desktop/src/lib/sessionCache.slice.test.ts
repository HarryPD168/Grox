import { describe, expect, it } from "vitest";
import { sliceCacheBlocks } from "./sessionCache";
import type { SessionBlock } from "../bridge/types";

function tool(i: number): SessionBlock {
  return {
    type: "tool",
    id: `t${i}`,
    ts: i,
    call: {
      id: `c${i}`,
      kind: "execute",
      title: `tool ${i}`,
      status: "done",
      startedAt: i,
    },
  };
}

describe("sliceCacheBlocks", () => {
  it("does not start mid-tool when truncating", () => {
    const blocks: SessionBlock[] = [];
    for (let i = 0; i < 50; i++) {
      if (i % 10 === 0) {
        blocks.push({ type: "user", id: `u${i}`, text: `msg ${i}`, ts: i });
      } else {
        blocks.push(tool(i));
      }
    }
    const sliced = sliceCacheBlocks(blocks, 15);
    expect(sliced[0].type).toBe("user");
    expect(sliced.length).toBeGreaterThanOrEqual(11);
    expect(sliced.length).toBeLessThanOrEqual(30);
  });

  it("skips interjected user as turn boundary", () => {
    const blocks: SessionBlock[] = [
      { type: "user", id: "u0", text: "main", ts: 0 },
      tool(1),
      tool(2),
      { type: "user", id: "inj", text: "插话", ts: 3, interjected: true },
      tool(4),
      tool(5),
      tool(6),
      tool(7),
      tool(8),
      tool(9),
      tool(10),
      tool(11),
      tool(12),
    ];
    const sliced = sliceCacheBlocks(blocks, 8);
    // Must not treat interject as primary boundary only — primary is u0 if within window,
    // or raw tail if walk-back exceeds max*2.
    expect(sliced[0].type === "user" ? (sliced[0] as { interjected?: boolean }).interjected : false).not.toBe(
      true,
    );
    if (sliced[0].type === "user") {
      expect((sliced[0] as { text: string }).text).toBe("main");
    }
  });

  it("max*2 cap can fall back to raw tail when walk-back is huge", () => {
    // One primary user at the start, then many tools — walk-back from length-max
    // reaches the user but span > max*2 so start resets to length-max.
    const blocks: SessionBlock[] = [
      { type: "user", id: "u0", text: "only primary", ts: 0 },
    ];
    for (let i = 1; i < 40; i++) blocks.push(tool(i));
    const max = 5;
    const sliced = sliceCacheBlocks(blocks, max);
    // Fallback: raw last max (may start mid-tool) — documents known residual.
    expect(sliced.length).toBe(max);
    expect(sliced[0].type).toBe("tool");
  });

  it("returns full array when under max", () => {
    const blocks: SessionBlock[] = [
      { type: "user", id: "u", text: "hi", ts: 1 },
      tool(2),
    ];
    expect(sliceCacheBlocks(blocks, 10)).toHaveLength(2);
  });
});
