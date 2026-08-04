/**
 * Detect UI "Grok 正在处理 · 0 条事件" stalls after a primary send.
 *
 * Evidence (spoofer 019fb6ef…, 2026-08-03): agent updates.jsonl ended mid
 * tool_call (cargo test timeout:0); offline UI forced status=idle; operator
 * sent from AUTO mode; UI painted running + user bubble; no further
 * user_message_chunk landed on disk until session/cancel (Stop). Permission
 * mode was a red herring — gates show cards, not zero-event chrome.
 *
 * Mid-turn / long-tool policy lives in `promptTurnTimeout.ts` (sliding idle +
 * absolute ceiling). These constants are only the first-event phase.
 *
 * R3 / 0.2.15: large OLD sessions after silent rehydrate often need more than
 * 25s for first live progress. Use POST_BIND budget one-shot after session/load;
 * warm already-bound turns stay on FIRST_EVENT_STALL_MS.
 */

/** Default first-event stall for warm / already-bound primaries. */
export const FIRST_EVENT_STALL_MS = 25_000;

/**
 * One-shot first-event budget after a successful session/load rehydrate
 * (silent first-send bind). Covers healthy post-bind TTFT without slowing
 * true hang detection on subsequent warm turns.
 */
export const POST_BIND_FIRST_EVENT_MS = 60_000;

/**
 * Resolve the first-event budget for a primary prompt write.
 * Pure helper — bridge passes `postBindGrace` for this write only (one-shot).
 */
export function resolveFirstEventMs(postBindGrace: boolean): number {
  return postBindGrace ? POST_BIND_FIRST_EVENT_MS : FIRST_EVENT_STALL_MS;
}

export type BlockLike = {
  type: string;
  interjected?: boolean;
};

/**
 * True when the active primary turn has only the operator bubble (no model
 * thought/tool/assistant/permission/question yet).
 */
export function isZeroEventLiveTurn(
  blocks: readonly BlockLike[],
  status: string,
): boolean {
  if (status !== "running" && status !== "awaiting_permission" && status !== "awaiting_input") {
    return false;
  }
  // awaiting_* already has a card → not a zero-event stall.
  if (status === "awaiting_permission" || status === "awaiting_input") {
    return false;
  }
  let lastPrimaryUser = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.type === "user" && !block.interjected) {
      lastPrimaryUser = i;
      break;
    }
  }
  if (lastPrimaryUser < 0) return false;
  for (let i = lastPrimaryUser + 1; i < blocks.length; i += 1) {
    if (blocks[i].type !== "user") return false;
  }
  return true;
}
