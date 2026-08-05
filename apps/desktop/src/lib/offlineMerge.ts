import type { Session, SessionBlock, SessionStatus } from "../bridge/types";

/** True when the live session must not be forced idle by a disk merge. */
export function isLiveBusyStatus(status: SessionStatus | undefined): boolean {
  return status === "running" || status === "awaiting_permission" || status === "awaiting_input";
}

/**
 * Content fingerprint for offline/live block identity.
 * Offline disk IDs and optimistic UI UUIDs almost never match — without this,
 * mergeOfflineWithLive appends the entire live transcript after disk history
 * (full duplicate conversation after scan completes).
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

/**
 * Reuse live block objects when content keys match offline (0.2.20).
 * Keeps React keys / turn grouping stable so late disk scan does not remount
 * the whole timeline and flash the viewport mid-history.
 */
export function stabilizeOfflineBlocksWithLive(
  offlineBlocks: readonly SessionBlock[],
  liveBlocks: readonly SessionBlock[],
): SessionBlock[] {
  if (liveBlocks.length === 0) return [...offlineBlocks];
  const liveByKey = new Map<string, SessionBlock>();
  for (const b of liveBlocks) {
    const k = blockContentKey(b);
    if (!liveByKey.has(k)) liveByKey.set(k, b);
  }
  return offlineBlocks.map((b) => liveByKey.get(blockContentKey(b)) ?? b);
}

/**
 * Merge offline disk history with any live-only blocks still on the session.
 * Preserves busy turn status so a late disk scan cannot unlock send mid-turn.
 *
 * When idle, offline is preferred as the authority if it is at least as rich
 * (by content keys). Matching content **reuses live block identities** so open
 * paint does not thrash 1s later (0.2.20). Live-only streaming / optimistic
 * bubbles are appended when their content is not already present on disk.
 */
export function mergeOfflineWithLive(pending: Session, cur: Session | undefined): Session {
  const busyStatus = cur && isLiveBusyStatus(cur.status) ? cur.status : null;
  const status = busyStatus ?? ("idle" as const);

  if (!cur || cur.blocks.length === 0) {
    return { ...pending, status };
  }

  const pendingKeys = new Set(pending.blocks.map(blockContentKey));
  const liveOnly = cur.blocks.filter((b) => !pendingKeys.has(blockContentKey(b)));
  const stabilized = stabilizeOfflineBlocksWithLive(pending.blocks, cur.blocks);

  // Idle + offline covers live content → offline structure, live identities.
  if (!busyStatus && liveOnly.length === 0) {
    return {
      ...pending,
      status: "idle",
      blocks: stabilized,
      usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
    };
  }

  // Idle + offline longer/equal and covers live → stabilize + residual liveOnly.
  if (!busyStatus && pending.blocks.length >= cur.blocks.length && liveOnly.length === 0) {
    return {
      ...pending,
      status: "idle",
      blocks: stabilized,
      usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
    };
  }

  // Live strictly longer by raw length AND no content overlap path for residuals:
  // keep live when offline is a short cache prefix of the same session (legacy).
  if (cur.blocks.length > pending.blocks.length && liveOnly.length === cur.blocks.length) {
    if (!busyStatus && pending.blocks.length >= Math.floor(cur.blocks.length * 0.5)) {
      const trailing = pickTrailingLiveOnly(cur.blocks, pendingKeys);
      return {
        ...pending,
        status: "idle",
        blocks: trailing.length > 0 ? [...stabilized, ...trailing] : stabilized,
        usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
      };
    }
    return { ...cur, status };
  }

  if (liveOnly.length === 0) {
    return {
      ...pending,
      status,
      blocks: stabilized,
      usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
    };
  }

  return {
    ...pending,
    status,
    blocks: [...stabilized, ...liveOnly],
    usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
  };
}

/**
 * When offline and live share almost no content keys (UUID vs disk ids),
 * only keep a short trailing live suffix that looks like the current turn
 * (last user + following blocks), not the entire live transcript.
 */
function pickTrailingLiveOnly(
  liveBlocks: SessionBlock[],
  pendingKeys: Set<string>,
): SessionBlock[] {
  // Walk from end: collect from last unmatched user through end.
  let start = -1;
  for (let i = liveBlocks.length - 1; i >= 0; i -= 1) {
    const b = liveBlocks[i];
    if (b.type === "user" && !pendingKeys.has(blockContentKey(b))) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    // No new user — keep last unmatched assistant/tool burst (max 12).
    const tail: SessionBlock[] = [];
    for (let i = liveBlocks.length - 1; i >= 0 && tail.length < 12; i -= 1) {
      const b = liveBlocks[i];
      if (pendingKeys.has(blockContentKey(b))) break;
      tail.unshift(b);
    }
    return tail;
  }
  return liveBlocks.slice(start).filter((b) => !pendingKeys.has(blockContentKey(b)));
}
