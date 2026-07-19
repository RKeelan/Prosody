/**
 * Pack metadata: the identifying fields and the active-activity flags that tell
 * the app which of the nine activities this pack supports.
 */

import { z } from "zod";

/** The schema version this module defines. Packs must declare exactly this. */
export const SCHEMA_VERSION = 1;

/**
 * Which activities a pack enables. One flag per activity, keyed by the section
 * the activity draws on (so `scansion` gates Activity 2, `pronouns` gates
 * Activity 3, and so on); `readSilently` gates Activity 1, which carries no
 * reference data. Every flag defaults to true—a pack opts an activity out
 * rather than opting each one in. The validator (Task 3) checks that an enabled
 * activity actually has its reference data.
 */
export const ActiveActivities = z.object({
  /** Activity 1: read silently. */
  readSilently: z.boolean().default(true),
  /** Activity 2: read aloud (scansion). */
  scansion: z.boolean().default(true),
  /** Activity 3: resolve pronouns and demonstratives. */
  pronouns: z.boolean().default(true),
  /** Activity 4: subject, verb, object. */
  sentences: z.boolean().default(true),
  /** Activity 5: gloss the diction. */
  glossary: z.boolean().default(true),
  /** Activity 6: sentence-level devices. */
  devices: z.boolean().default(true),
  /** Activity 7: broad devices (speaker, addressee, point of view). */
  broadDevices: z.boolean().default(true),
  /** Activity 8: chase the allusions. */
  allusions: z.boolean().default(true),
  /** Activity 9: state the argument. */
  argument: z.boolean().default(true),
});
export type ActiveActivities = z.infer<typeof ActiveActivities>;
