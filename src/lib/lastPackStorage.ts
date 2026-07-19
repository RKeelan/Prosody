/**
 * Caching the last-loaded pack's raw text, so a reload restores the study
 * session without re-picking the file.
 *
 * $Claude Vision.md's pack-loading section doesn't cover reload behaviour—it
 * specifies file-picker and drag-drop loading, nothing about what happens
 * when the tab is refreshed. Left unaddressed, a reload dead-ends on the
 * landing screen: the `File` a picker or drop hands the app cannot be
 * re-read from disk on its own, and Richard tests this flow from his phone.
 * A dedicated storage key, sitting alongside but outside the session store
 * (see `./session`'s `prosody:session:*` keys), holds the exact raw text
 * last loaded; the app replays it through the same {@link loadPackFromText}
 * pipeline on startup. "Change poem" clears this key without touching any
 * session progress—the two are deliberately independent.
 */

import type { SessionStorage } from "./session";

/** The storage key under which the last-loaded pack's raw text is cached. */
export const LAST_PACK_KEY = "prosody:last-pack";

/** Cache `rawText` as the last-loaded pack, for reload to pick back up. */
export function saveLastPackText(storage: SessionStorage, rawText: string): void {
  storage.setItem(LAST_PACK_KEY, rawText);
}

/** The last-cached pack's raw text, or `null` if nothing is cached. */
export function loadLastPackText(storage: SessionStorage): string | null {
  return storage.getItem(LAST_PACK_KEY);
}

/** Clear the cached pack text ("change poem"). Leaves session progress untouched. */
export function clearLastPackText(storage: SessionStorage): void {
  storage.removeItem(LAST_PACK_KEY);
}
