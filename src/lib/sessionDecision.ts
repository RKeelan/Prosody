/**
 * The resume-vs-fresh decision for a freshly loaded pack.
 *
 * Vision.md keys progress by pack id plus content hash and, "on hash change:
 * offer keep-progress or start-fresh." {@link decideSession} is the pure
 * decision behind that offer: given a just-loaded pack's id and content
 * hash, it looks at whatever is already in storage and reports one of three
 * outcomes—resume an exact match, offer keep-or-fresh because progress
 * exists under a different hash for the same pack id (the pack's text
 * changed since), or start fresh because nothing is there at all. It touches
 * only the injected {@link SessionStorage}, so it is testable with
 * `createMemoryStorage` and carries no browser dependency.
 */

import { listSessionsForPack, loadSession, type SessionData, type SessionStorage } from "./session";

export type SessionDecision =
  | { readonly kind: "resume"; readonly session: SessionData }
  | {
      readonly kind: "offer-keep-or-fresh";
      readonly staleHash: string;
      readonly staleSession: SessionData;
    }
  | { readonly kind: "fresh" };

/**
 * Decide what to do with stored progress for a pack that just loaded at
 * `contentHash`. A corrupt entry at the exact hash, or at a stale hash, is
 * treated the same as absent—{@link loadSession} already reports corruption
 * as `{ ok: false }` rather than throwing, and a session that cannot be read
 * back is not one this function can offer to resume.
 */
export function decideSession(
  storage: SessionStorage,
  packId: string,
  contentHash: string,
): SessionDecision {
  const exact = loadSession(storage, packId, contentHash);
  if (exact?.ok) {
    return { kind: "resume", session: exact.data };
  }

  const staleCandidates = listSessionsForPack(storage, packId)
    .filter((ref) => ref.contentHash !== contentHash)
    .map((ref) => loadSession(storage, ref.packId, ref.contentHash))
    .filter((result): result is { ok: true; data: SessionData } => result?.ok === true);

  if (staleCandidates.length === 0) {
    return { kind: "fresh" };
  }

  // $Claude Multiple stale hashes arise only from repeated pack edits, each
  // left un-decided. Vision.md doesn't say which to offer when more than one
  // exists; the most recently started attempt is the one the learner is most
  // likely mid-way through, so it wins over older stale progress.
  const chosen = staleCandidates.reduce((latest, candidate) =>
    candidate.data.currentAttempt.startedAt > latest.data.currentAttempt.startedAt
      ? candidate
      : latest,
  );
  return {
    kind: "offer-keep-or-fresh",
    staleHash: chosen.data.contentHash,
    staleSession: chosen.data,
  };
}
