/**
 * The Prosody pack schema.
 *
 * A pack is one poem plus the reference data the nine activities draw on. This
 * module assembles the top-level {@link Pack} schema from the per-section
 * modules and re-exports every section's schema and inferred type, so consumers
 * import from `@/lib/pack`. Zod defines the shape once: runtime validation with
 * inline errors on load, inferred TypeScript types, and (later) the authoring
 * CLI validator all share it.
 *
 * Required: metadata and the poem. Every activity's reference section is
 * optional here—a pack that opts an activity out simply omits it. Keeping the
 * consistency rules (an enabled activity must have its data, anchors must
 * resolve, syllable counts must match) in the Task 3 validator, not the schema,
 * is deliberate: the schema states shape, the validator states truth.
 */

import { z } from "zod";
import { Allusion } from "./allusions";
import { Argument } from "./argument";
import { BroadDevices } from "./broadDevices";
import { nonEmptyString, slug } from "./common";
import { Devices } from "./devices";
import { GlossaryEntry } from "./glossary";
import { ActiveActivities, SCHEMA_VERSION } from "./metadata";
import { Poem } from "./poem";
import { PronounTarget } from "./pronouns";
import { Scansion } from "./scansion";
import { Sentence } from "./sentences";

export * from "./allusions";
export * from "./argument";
export * from "./broadDevices";
export * from "./common";
export * from "./devices";
export * from "./glossary";
export * from "./metadata";
export * from "./poem";
export * from "./pronouns";
export * from "./scansion";
export * from "./sentences";

export const Pack = z.object({
  /** The schema version this pack targets. Must equal {@link SCHEMA_VERSION}. */
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Stable pack id, used to key persisted progress. */
  id: slug,
  title: nonEmptyString,
  poet: nonEmptyString,
  /** Which activities this pack enables; every flag defaults to true. */
  activeActivities: ActiveActivities.default(() => ActiveActivities.parse({})),
  poem: Poem,
  scansion: Scansion.optional(),
  pronouns: z.array(PronounTarget).optional(),
  sentences: z.array(Sentence).optional(),
  glossary: z.array(GlossaryEntry).optional(),
  devices: Devices.optional(),
  broadDevices: BroadDevices.optional(),
  allusions: z.array(Allusion).optional(),
  argument: Argument.optional(),
});
export type Pack = z.infer<typeof Pack>;
