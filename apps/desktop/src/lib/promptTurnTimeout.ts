/**
 * Long-turn session/prompt timeout policy.
 *
 * Evidence (spoofer / pre-push, 2026-08-04): primary `session/prompt` used a
 * fixed 15-minute FE timer. Healthy multi-tool turns (workspace cargo test +
 * edits) hit wall-clock 900s → "Grok Agent 请求超时：session/prompt" → idle
 * with tools stuck "执行中", operator had to send a kick message.
 *
 * Policy:
 * 1) First-event stall (separate constant in firstEventWatch) — 0 events.
 * 2) After events: idle timeout only when no open tools (silent model hang).
 * 3) Absolute ceiling always (safety for zombies / silent long tools).
 * 4) Open tools suppress idle — long cargo tests emit nothing for a long time.
 */

/** No session/update while tools are closed → treat as mid-turn model stall. */
export const PROMPT_TURN_IDLE_MS = 45 * 60_000;

/**
 * Hard wall-clock ceiling from session/prompt write.
 * Long enough for multi-hour agent work; not infinite.
 */
export const PROMPT_TURN_ABSOLUTE_MS = 4 * 60 * 60_000;

/** Poll interval for the FE watchdog. */
export const PROMPT_TURN_POLL_MS = 2_000;

export type PromptTurnExpireReason = "ok" | "first_event" | "idle" | "absolute";

export function shouldExpirePromptTurn(args: {
  now: number;
  /** Wall clock when session/prompt was written. */
  writtenAt: number;
  /**
   * Last live activity (session/update / gate). `0` or `< writtenAt` means
   * no first event yet.
   */
  lastActivityAt: number;
  /** True while any tool_call is still pending/running/awaiting permission. */
  hasOpenTools: boolean;
  /**
   * True while a permission / plan / question card is waiting on the operator.
   * Must suppress idle the same way open tools do (human is the bottleneck).
   */
  hasOpenGate?: boolean;
  firstEventMs?: number;
  idleMs?: number;
  absoluteMs?: number;
}): PromptTurnExpireReason {
  const firstEventMs = args.firstEventMs ?? 25_000;
  const idleMs = args.idleMs ?? PROMPT_TURN_IDLE_MS;
  const absoluteMs = args.absoluteMs ?? PROMPT_TURN_ABSOLUTE_MS;

  if (args.now - args.writtenAt >= absoluteMs) return "absolute";

  const hasFirstEvent = args.lastActivityAt >= args.writtenAt && args.lastActivityAt > 0;
  if (!hasFirstEvent) {
    if (args.now - args.writtenAt >= firstEventMs) return "first_event";
    return "ok";
  }

  // Long silent tools (cargo test) or operator gates: do not idle-kill.
  if (args.hasOpenTools || args.hasOpenGate) return "ok";

  if (args.now - args.lastActivityAt >= idleMs) return "idle";
  return "ok";
}

/** Wire statuses that keep a tool "open" for idle suppress. */
export function isOpenToolStatus(status: string): boolean {
  return status === "pending" || status === "running" || status === "awaiting_permission";
}

/**
 * Operator-facing timeout copy. Must include phrases matched by store
 * queueNotice / Timeline turnErrors (`自动终止|无事件返回|小时上限|无新输出`).
 *
 * Bridge expire must `emit({ type: "error", message })` **before**
 * `invalidatePromptFlights` so gen bump cannot swallow this (R2 P0).
 */
export function promptTurnTimeoutMessage(reason: Exclude<PromptTurnExpireReason, "ok">): string {
  switch (reason) {
    case "first_event":
      return "Agent 超过 25s 无事件返回（常见于上一轮工具未结束）。已自动终止，可发消息重试。";
    case "idle":
      return `Agent 超过 ${Math.round(PROMPT_TURN_IDLE_MS / 60_000)} 分钟无新输出且无运行中工具。已自动终止，可发消息继续。`;
    case "absolute":
      return `本轮已超过 ${Math.round(PROMPT_TURN_ABSOLUTE_MS / 3_600_000)} 小时上限。已自动终止，可发消息继续。`;
  }
}

/** True if a bridge/store error message is a prompt-turn watchdog timeout. */
export function isPromptTurnTimeoutMessage(message: string): boolean {
  return /自动终止|无事件返回|小时上限|无新输出/.test(message);
}

/**
 * session/update kinds that count as live turn progress for the sliding
 * first-event / idle clock. Excludes user_message_chunk echo and pure mode
 * updates so "0 条事件" hangs still hit the 25s first-event stall (R2).
 */
export const LIVE_TURN_PROGRESS_UPDATES = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "turn_completed",
]);

export function isLiveTurnProgressUpdate(sessionUpdate: string | undefined): boolean {
  if (!sessionUpdate) return false;
  return LIVE_TURN_PROGRESS_UPDATES.has(sessionUpdate);
}
