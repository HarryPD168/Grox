import { describe, expect, it } from "vitest";
import {
  canReleasePinningFlag,
  pinLayoutRetryDelayMs,
  pinReleaseDelayMs,
  shouldPinBottomOnIdleGrow,
} from "./timelineScrollPolicy";

describe("timelineScrollPolicy (open pin / unfollow)", () => {
  it("pin release uses full suppressMs, not layout cap alone", () => {
    expect(pinReleaseDelayMs(2000)).toBe(2000);
    expect(pinLayoutRetryDelayMs(2000)).toBe(320);
    expect(pinLayoutRetryDelayMs(200)).toBe(200);
    expect(pinReleaseDelayMs(400)).toBe(400);
  });

  it("canReleasePinningFlag respects 50ms slack", () => {
    expect(canReleasePinningFlag(1000, 1000)).toBe(true);
    expect(canReleasePinningFlag(949, 1000)).toBe(false);
    expect(canReleasePinningFlag(950, 1000)).toBe(true);
  });

  it("open grace and first paint force pin on grow", () => {
    expect(
      shouldPinBottomOnIdleGrow({
        grew: true,
        follow: false,
        inOpenGrace: true,
        prevLen: 10,
      }),
    ).toBe("pin");
    expect(
      shouldPinBottomOnIdleGrow({
        grew: true,
        follow: false,
        inOpenGrace: false,
        prevLen: 0,
      }),
    ).toBe("pin");
  });

  it("unfollowed history grow uses anchor_delta", () => {
    expect(
      shouldPinBottomOnIdleGrow({
        grew: true,
        follow: false,
        inOpenGrace: false,
        prevLen: 5,
      }),
    ).toBe("anchor_delta");
  });

  it("no growth is none", () => {
    expect(
      shouldPinBottomOnIdleGrow({
        grew: false,
        follow: true,
        inOpenGrace: true,
        prevLen: 0,
      }),
    ).toBe("none");
  });
});
