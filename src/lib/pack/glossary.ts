/**
 * Activity 5 (gloss the diction): the reference gloss for each word worth
 * defining.
 *
 * `essential` drives the coverage check—did the learner gloss the words the
 * pack deems essential. `oddUsage` marks a word the poem uses in an unexpected
 * sense; such entries must record both senses (the everyday one and the poem's),
 * enforced here.
 */

import { z } from "zod";
import { nonEmptyString, QuoteAnchor } from "./common";

export const GlossaryEntry = z
  .object({
    /** The word in the poem this entry glosses. */
    word: QuoteAnchor,
    /** Whether the coverage check expects the learner to gloss this word. */
    essential: z.boolean().default(false),
    /** Whether the poem uses this word in an odd or unexpected sense. */
    oddUsage: z.boolean().default(false),
    /**
     * The sense(s) the word carries. Odd-usage words must list both—the
     * everyday sense and the sense the poem exploits.
     */
    senses: z.array(nonEmptyString).min(1),
  })
  .refine((e) => !e.oddUsage || e.senses.length >= 2, {
    message: "odd-usage words must record both senses",
    path: ["senses"],
  });
export type GlossaryEntry = z.infer<typeof GlossaryEntry>;
