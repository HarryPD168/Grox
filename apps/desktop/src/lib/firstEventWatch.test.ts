import { describe, expect, it } from "vitest";
import {
  FIRST_EVENT_STALL_MS,
  POST_BIND_FIRST_EVENT_MS,
  isZeroEventLiveTurn,
  resolveFirstEventMs,
} from "./firstEventWatch";

describe("resolveFirstEventMs", () => {
  it("uses warm baseline when post-bind grace is off", () => {
    expect(resolveFirstEventMs(false)).toBe(FIRST_EVENT_STALL_MS);
    expect(FIRST_EVENT_STALL_MS).toBe(25_000);
  });

  it("uses post-bind budget when grace is armed (R3 one-shot)", () => {
    expect(resolveFirstEventMs(true)).toBe(POST_BIND_FIRST_EVENT_MS);
    expect(POST_BIND_FIRST_EVENT_MS).toBe(60_000);
    expect(POST_BIND_FIRST_EVENT_MS).toBeGreaterThan(FIRST_EVENT_STALL_MS);
  });
});

describe("isZeroEventLiveTurn", () => {
  it("detects running turn with only the primary user bubble", () => {
    expect(
      isZeroEventLiveTurn(
        [
          { type: "assistant" },
          { type: "user", interjected: false },
        ],
        "running",
      ),
    ).toBe(true);
  });

  it("is false once any model event exists after the user bubble", () => {
    expect(
      isZeroEventLiveTurn(
        [
          { type: "user" },
          { type: "thinking" },
        ],
        "running",
      ),
    ).toBe(false);
    expect(
      isZeroEventLiveTurn(
        [
          { type: "user" },
          { type: "tool" },
        ],
        "running",
      ),
    ).toBe(false);
  });

  it("ignores interjections when finding the primary user", () => {
    expect(
      isZeroEventLiveTurn(
        [
          { type: "user" },
          { type: "user", interjected: true },
        ],
        "running",
      ),
    ).toBe(true);
  });

  it("is false when idle or when a gate card is up", () => {
    expect(isZeroEventLiveTurn([{ type: "user" }], "idle")).toBe(false);
    expect(isZeroEventLiveTurn([{ type: "user" }], "awaiting_permission")).toBe(false);
  });
});
