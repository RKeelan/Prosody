/**
 * Display metadata for the nine activities: their canonical number and title
 * (Vision.md's activity headings), and the Plan.md task that builds each
 * one's real UI. Task 7 draws on this for the activity nav and for each
 * activity's placeholder card—every activity is a stub until its Stage 3 task
 * lands, and the placeholder names that task so it's obvious what's missing
 * and why.
 */

import { ACTIVITY_KEYS, type ActivityKey } from "./session";

/** One activity's nav and placeholder-card metadata. */
export interface ActivityInfo {
  readonly key: ActivityKey;
  /** 1-based activity number, matching Vision.md's "Activity N" headings. */
  readonly number: number;
  /** Short title for the nav and placeholder card. */
  readonly title: string;
  /** The Plan.md task number that builds this activity's real UI. */
  readonly planTask: number;
}

/**
 * Every activity, in {@link ACTIVITY_KEYS} order. Spelled out rather than
 * generated so each title reads naturally; a test guards that the keys and
 * numbering stay in step with {@link ACTIVITY_KEYS} as the pack schema grows.
 */
export const ACTIVITIES: readonly ActivityInfo[] = [
  { key: "readSilently", number: 1, title: "Read silently", planTask: 9 },
  { key: "scansion", number: 2, title: "Read aloud", planTask: 10 },
  { key: "pronouns", number: 3, title: "Pronouns and demonstratives", planTask: 11 },
  { key: "sentences", number: 4, title: "Subject, verb, object", planTask: 12 },
  { key: "glossary", number: 5, title: "Gloss the diction", planTask: 13 },
  { key: "devices", number: 6, title: "Sentence-level devices", planTask: 14 },
  { key: "broadDevices", number: 7, title: "Broad devices", planTask: 15 },
  { key: "allusions", number: 8, title: "Chase the allusions", planTask: 16 },
  { key: "argument", number: 9, title: "State the argument", planTask: 17 },
];

// A Record, not a Map: ActivityKey is a closed union, so every key has an
// entry by construction and lookup needs no runtime undefined check.
const BY_KEY = Object.fromEntries(ACTIVITIES.map((info) => [info.key, info])) as Record<
  ActivityKey,
  ActivityInfo
>;

/** Look up one activity's display metadata by key. Every {@link ActivityKey} has an entry. */
export function activityInfo(key: ActivityKey): ActivityInfo {
  return BY_KEY[key];
}
