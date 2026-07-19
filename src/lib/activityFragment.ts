/**
 * The activity key to URL hash fragment mapping.
 *
 * Vision.md rules out a router: "at most a hash fragment deep-links an
 * activity." This module owns that one small piece of format—each of the
 * nine {@link ActivityKey}s (`readSilently`, `scansion`, ...) maps to its
 * kebab-case fragment (`read-silently`, `scansion`, ...) and back, so the app
 * shell can set `location.hash` on selection and resolve it again on load and
 * `hashchange` without duplicating the spelling in two places.
 */

import { ACTIVITY_KEYS, type ActivityKey } from "./session";

/** Convert a camelCase activity key to its kebab-case fragment, e.g. `"readSilently"` to `"read-silently"`. */
export function activityKeyToFragment(key: ActivityKey): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const FRAGMENT_TO_KEY = new Map<string, ActivityKey>(
  ACTIVITY_KEYS.map((key) => [activityKeyToFragment(key), key]),
);

/** Resolve a hash fragment (without its leading `#`) back to an activity key, or `null` if it names none. */
export function activityKeyFromFragment(fragment: string): ActivityKey | null {
  return FRAGMENT_TO_KEY.get(fragment) ?? null;
}
