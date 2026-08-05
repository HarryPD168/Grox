import { describe, expect, it } from "vitest";
import { sliceCacheBlocks } from "./sessionCache";
import type { SessionBlock } from "../bridge/types";

describe("sliceCacheBlocks", () => {
  it("does not start mid-tool when truncating", () => {
    const blocks: SessionBlock[] = [];
    for (let i = 0; i < 50; i++) {
      if (i % 10 === 0) {
        blocks.push({ type: "user", id: `u${i}`, text: `msg ${i}`, ts: i });
      } else {
        blocks.push({
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
        });
      }
    }
    // max=15 would raw-slice mid-tools; user-boundary should land on a user.
    const sliced = sliceCacheBlocks(blocks, 15);
    expect(sliced[0].type).toBe("user");
    expect(sliced.length).toBeGreaterThanOrEqual(11);
    expect(sliced.length).toBeLessThanOrEqual(30);
  });
});
