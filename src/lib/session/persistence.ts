/**
 * Mapping sessions to storage.
 *
 * Progress for one pack lives under a stable key,
 * `prosody:session:<packId>:<contentHash>`. The pack id groups a poem's sessions;
 * the content hash distinguishes progress made against different revisions of the
 * same pack (Vision.md keys progress by "pack ID + content hash", offering
 * keep-or-start-fresh when the hash changes). This module owns the key format and
 * the handful of storage operations Task 7 needs: load, save, list every session
 * for a pack id, and re-key a session onto a new content hash when the pack text
 * changes but the learner keeps their progress.
 *
 * Everything here takes an injected {@link SessionStorage}, so it runs under
 * `bun test` against the in-memory fake with no browser.
 */

import type { SessionData } from "./model";
import { type DeserialiseResult, deserialiseSession, serialiseSession } from "./serialise";
import type { SessionStorage } from "./storage";

/** The stable key prefix under which all session progress is stored. */
export const STORAGE_PREFIX = "prosody:session";

/** The storage key for one pack's session at a given content hash. */
export function sessionKey(packId: string, contentHash: string): string {
  return `${STORAGE_PREFIX}:${packId}:${contentHash}`;
}

/** A stored session key split into its pack id and content hash. */
export interface ParsedSessionKey {
  readonly packId: string;
  readonly contentHash: string;
}

/**
 * Split a storage key back into its parts, or `null` if it is not one of ours.
 * Pack ids are slugs and content hashes are hex, so neither contains the `:`
 * separator; a key is ours only when it has exactly the four expected segments.
 */
export function parseSessionKey(key: string): ParsedSessionKey | null {
  const parts = key.split(":");
  if (parts.length !== 4) return null;
  const [namespace, kind, packId, contentHash] = parts;
  if (namespace !== "prosody" || kind !== "session") return null;
  if (packId.length === 0 || contentHash.length === 0) return null;
  return { packId, contentHash };
}

/** A reference to a stored session, without loading it. */
export interface StoredSessionRef extends ParsedSessionKey {
  /** The full storage key. */
  readonly key: string;
}

/**
 * Load and validate the session stored for a pack id and content hash. Returns
 * `null` when nothing is stored, or a {@link DeserialiseResult} otherwise—so a
 * corrupt entry surfaces as `{ ok: false }` rather than a throw.
 */
export function loadSession(
  storage: SessionStorage,
  packId: string,
  contentHash: string,
): DeserialiseResult | null {
  const text = storage.getItem(sessionKey(packId, contentHash));
  return text === null ? null : deserialiseSession(text);
}

/** Write a session through to storage under its own pack id and content hash. */
export function saveSession(storage: SessionStorage, data: SessionData): void {
  storage.setItem(sessionKey(data.packId, data.contentHash), serialiseSession(data));
}

/** Every stored session belonging to `packId`, across all content hashes. */
export function listSessionsForPack(storage: SessionStorage, packId: string): StoredSessionRef[] {
  const refs: StoredSessionRef[] = [];
  for (const key of storage.keys()) {
    const parsed = parseSessionKey(key);
    if (parsed && parsed.packId === packId) {
      refs.push({ key, packId: parsed.packId, contentHash: parsed.contentHash });
    }
  }
  return refs;
}

/**
 * Move a stored session from one content hash to another, updating the embedded
 * {@link SessionData.contentHash} to match its new key. This is the "keep
 * progress" path when a pack's text changes: the learner's attempt is preserved
 * but re-filed under the new hash. Returns true if a session was moved, false if
 * there was nothing at `oldHash` or it was corrupt. A no-op (old equals new)
 * succeeds without touching storage.
 */
export function rekeySession(
  storage: SessionStorage,
  packId: string,
  oldHash: string,
  newHash: string,
): boolean {
  const oldKey = sessionKey(packId, oldHash);
  if (oldHash === newHash) return storage.getItem(oldKey) !== null;

  const text = storage.getItem(oldKey);
  if (text === null) return false;
  const result = deserialiseSession(text);
  if (!result.ok) return false;

  const migrated: SessionData = { ...result.data, contentHash: newHash };
  storage.setItem(sessionKey(packId, newHash), serialiseSession(migrated));
  storage.removeItem(oldKey);
  return true;
}
