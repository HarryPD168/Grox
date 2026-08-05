/**
 * Pure helpers for Timeline open-pin / unfollow (0.2.25–0.2.26).
 * Extracted so open-grace and pin-release rules can be unit-tested without DOM.
 */

/** Cap for the "re-apply scrollTop after layout" timeout (ms). */
export const PIN_LAYOUT_RETRY_CAP_MS = 320;

/**
 * After pinBottomHard(suppressMs), when should we schedule the pin-flag release?
 * Always schedule at full suppressMs — never at the layout-retry cap alone
 * (evidence: open uses 2000ms suppress; cap-only release left pinningRef stuck).
 */
export function pinReleaseDelayMs(suppressMs: number): number {
  return Math.max(0, suppressMs);
}

/** Delay for the late layout re-stick (independent of pin release). */
export function pinLayoutRetryDelayMs(suppressMs: number): number {
  return Math.min(Math.max(0, suppressMs), PIN_LAYOUT_RETRY_CAP_MS);
}

/**
 * Whether the pin flag may clear at `now` given the suppress deadline.
 * Matches Timeline: clear only if now >= suppressUntil - 50.
 */
export function canReleasePinningFlag(now: number, suppressUntil: number): boolean {
  return now >= suppressUntil - 50;
}

/**
 * On content height growth while idle: pin bottom when following, in open grace,
 * or first paint (prevLen === 0). Otherwise preserve scrollTop via delta for
 * pure prepends only (caller applies delta).
 */
export function shouldPinBottomOnIdleGrow(input: {
  grew: boolean;
  follow: boolean;
  inOpenGrace: boolean;
  prevLen: number;
}): "pin" | "anchor_delta" | "none" {
  if (!input.grew) return "none";
  if (input.follow || input.inOpenGrace || input.prevLen === 0) return "pin";
  return "anchor_delta";
}
