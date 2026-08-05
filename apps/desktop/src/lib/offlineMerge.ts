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
 * Reuse live block objects when content keys match offline.
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
 *
 * 0.2.22 open-flash fix:
 * UI fingerprint paint is the **visual authority** for the open session.
 * Offline scan must only **prepend** older history that is not already in live,
 * never replace the live tail (that rewrote turn ids / dropped latest content
 * and yanked the scroller mid-history ~1s after open).
 *
 * Busy status is preserved so a late disk scan cannot unlock send mid-turn.
 */
export function mergeOfflineWithLive(pending: Session, cur: Session | undefined): Session {
  const busyStatus = cur && isLiveBusyStatus(cur.status) ? cur.status : null;
  const status = busyStatus ?? ("idle" as const);

  if (!cur || cur.blocks.length === 0) {
    return { ...pending, status };
  }

  const liveKeys = cur.blocks.map(blockContentKey);
  const liveKeySet = new Set(liveKeys);
  const pendingKeys = new Set(pending.blocks.map(blockContentKey));
  const liveOnly = cur.blocks.filter((b) => !pendingKeys.has(blockContentKey(b)));

  // --- Prefer live tail: prepend offline-only prefix before first live overlap ---
  // UI open paint is almost always a *suffix* of full disk history (fingerprint /
  // cache). Replacing the whole array with disk caused the 1s "content switch".
  if (!busyStatus && liveKeys.length > 0) {
    const firstLiveKey = liveKeys[0]!;
    const firstOverlap = pending.blocks.findIndex((b) => blockContentKey(b) === firstLiveKey);

    if (firstOverlap > 0) {
      // Offline has older blocks before what the UI already shows.
      const prefix = pending.blocks.slice(0, firstOverlap);
      // Keep every live block object (stable React keys / latest content).
      return {
        ...pending,
        status: "idle",
        blocks: [...prefix, ...cur.blocks],
        usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
      };
    }

    if (firstOverlap === 0) {
      // Same start key: keep live tail entirely; only add offline blocks whose
      // content is not already in live (older gaps are rare when overlap is 0).
      const offlineOnly = pending.blocks.filter((b) => !liveKeySet.has(blockContentKey(b)));
      if (offlineOnly.length === 0 && liveOnly.length === 0) {
        // Disk equals painted content — keep live identities (no remount).
        return {
          ...cur,
          status: "idle",
          usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
        };
      }
      if (offlineOnly.length === 0) {
        // Live has extra trailing (e.g. just-sent); keep live as-is.
        return { ...cur, status: "idle" };
      }
      // Offline-only blocks exist but first keys match — treat offline-only as
      // prefix material only when they all appear before any live key in pending.
      const firstLiveInPending = pending.blocks.findIndex((b) => liveKeySet.has(blockContentKey(b)));
      const purePrefix =
        firstLiveInPending > 0
          ? pending.blocks.slice(0, firstLiveInPending).filter((b) => !liveKeySet.has(blockContentKey(b)))
          : [];
      if (purePrefix.length > 0) {
        return {
          ...pending,
          status: "idle",
          blocks: [...purePrefix, ...cur.blocks],
          usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
        };
      }
      // Fall through to stabilize path for odd interleaves.
    }

    if (firstOverlap < 0) {
      // No content overlap (total ID/content mismatch). Prefer longer offline
      // with trailing live-only when offline is substantial; else keep live.
      if (pending.blocks.length >= Math.floor(cur.blocks.length * 0.5)) {
        const trailing = pickTrailingLiveOnly(cur.blocks, pendingKeys);
        const stabilized = stabilizeOfflineBlocksWithLive(pending.blocks, cur.blocks);
        return {
          ...pending,
          status: "idle",
          blocks: trailing.length > 0 ? [...stabilized, ...trailing] : stabilized,
          usage: cur.usage?.outputTokens ? cur.usage : pending.usage,
        };
      }
      return { ...cur, status: "idle" };
    }
  }

  // Busy turn: stabilize offline + append live-only, keep busy status.
  const stabilized = stabilizeOfflineBlocksWithLive(pending.blocks, cur.blocks);
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
 * only keep a short trailing live suffix that looks like the current turn.
 */
function pickTrailingLiveOnly(
  liveBlocks: SessionBlock[],
  pendingKeys: Set<string>,
): SessionBlock[] {
  let start = -1;
  for (let i = liveBlocks.length - 1; i >= 0; i -= 1) {
    const b = liveBlocks[i];
    if (b.type === "user" && !pendingKeys.has(blockContentKey(b))) {
      start = i;
      break;
    }
  }
  if (start < 0) {
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
