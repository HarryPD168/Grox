import type { Session, SessionBlock, SessionStatus } from "../bridge/types";

/** True when the live session must not be forced idle by a disk merge. */
export function isLiveBusyStatus(status: SessionStatus | undefined): boolean {
  return status === "running" || status === "awaiting_permission" || status === "awaiting_input";
}

/**
 * Content fingerprint for offline/live block identity.
 */
export function blockContentKey(block: SessionBlock): string {
  switch (block.type) {
    case "user":
      return `user:${block.interjected ? "i:" : ""}${block.text.trim().slice(0, 240)}`;
    case "assistant":
      return `assistant:${block.text.trim().slice(0, 240)}`;
    case "thinking":
      return `thinking:${block.text.trim().slice(0, 160)}`;
    case "tool":
      return `tool:${block.call.id || block.call.title}:${block.call.kind}`;
    case "plan":
      return `plan:${block.steps.map((s) => s.content).join("|").slice(0, 160)}`;
    case "permission":
      return `perm:${block.id}:${block.req?.title ?? ""}`;
    case "question":
      return `q:${block.id}`;
    case "system":
      return `sys:${block.kind ?? ""}:${block.text.trim().slice(0, 120)}`;
    default:
      return `other:${(block as SessionBlock).type}:${(block as SessionBlock).id}`;
  }
}

/** First primary (non-interject) user block — stable turn boundary for seaming. */
export function firstPrimaryUserBlock(
  blocks: readonly SessionBlock[],
): SessionBlock | undefined {
  return blocks.find((b) => b.type === "user" && !b.interjected);
}

/**
 * Merge offline disk history with any live-only blocks still on the session.
 *
 * Evidence (spoof 019fb6ef…, 0.2.22 install):
 * - get_ui_transcript fingerprint missed (mtime/size race) → open painted
 *   session-cache starting on a **tool** mid-stream.
 * - merge used firstLiveKey = that tool → wrong seam, duplicated tail, user
 *   bubble "处理好了…" appeared after Push (wrong relative order in paint).
 *
 * Rule: seam on the **first primary user** in live, never on a tool.
 * Live tail is visual authority; offline only contributes a pure prefix.
 */
export function mergeOfflineWithLive(pending: Session, cur: Session | undefined): Session {
  const busyStatus = cur && isLiveBusyStatus(cur.status) ? cur.status : null;
  const status = busyStatus ?? ("idle" as const);

  if (!cur || cur.blocks.length === 0) {
    return { ...pending, status };
  }

  const pendingKeys = new Set(pending.blocks.map(blockContentKey));
  const liveOnly = cur.blocks.filter((b) => !pendingKeys.has(blockContentKey(b)));

  // Seam on first primary user in the painted (live) window.
  const anchor = firstPrimaryUserBlock(cur.blocks);
  if (anchor && !busyStatus) {
    const anchorKey = blockContentKey(anchor);
    const seam = pending.blocks.findIndex((b) => blockContentKey(b) === anchorKey);
    if (seam > 0) {
      const prefix = pending.blocks.slice(0, seam);
      return {
        ...pending,
        status: "idle",
        blocks: [...prefix, ...cur.blocks],
        usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
      };
    }
    if (seam === 0) {
      // Live window starts at the same user as offline — keep live tail.
      // Offline-only blocks that appear before any later live key are rare;
      // live is authority for the open paint.
      if (liveOnly.length === 0) {
        return {
          ...cur,
          status: "idle",
          usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
        };
      }
      return {
        ...cur,
        status: "idle",
        blocks: [...cur.blocks], // liveOnly already inside cur
        usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
      };
    }
    // Anchor user not found on disk: keep live (don't replace with unrelated offline).
    if (seam < 0) {
      return { ...cur, status: "idle" };
    }
  }

  // Busy: keep status; prefer live blocks + any offline-only trailing is not applied
  // (scan waits until idle via pendingOfflineMerge).
  if (busyStatus) {
    return {
      ...cur,
      status: busyStatus,
      blocks: liveOnly.length === 0 ? cur.blocks : cur.blocks,
      usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
    };
  }

  // No primary user in live (orphan tools only) — keep live to avoid tool-key seam.
  return { ...cur, status: "idle" };
}
