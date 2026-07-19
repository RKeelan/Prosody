/**
 * Activity 8 (chase the allusions): the reference allusion cards.
 *
 * Each card ties a span to its source as the original audience knew it, and a
 * separate "what it imports" note. The UI keeps the imports note hidden until
 * the learner writes their own one-liner; the schema simply carries both.
 */

import { z } from "zod";
import { nonEmptyString, QuoteAnchor } from "./common";

export const Allusion = z.object({
  /** The span in the poem that alludes. */
  anchor: QuoteAnchor,
  /** The source story, verse, or figure as the original audience knew it. */
  source: nonEmptyString,
  /** What the allusion imports into the poem. */
  imports: nonEmptyString,
});
export type Allusion = z.infer<typeof Allusion>;
