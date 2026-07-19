/**
 * Activity 3 (resolve pronouns and demonstratives): each target pronoun and the
 * antecedent that resolves it.
 *
 * The antecedent is a {@link TargetAnswer}, so it can be answered by span or by
 * typed text, and it carries alternates for the cases where the ambiguity is the
 * poem's own point.
 */

import { z } from "zod";
import { QuoteAnchor, TargetAnswer } from "./common";

export const PronounTarget = z.object({
  /** The pronoun or demonstrative in the poem, rendered as a chip. */
  pronoun: QuoteAnchor,
  /** Its antecedent: a span or typed answer, with acceptable alternates. */
  antecedent: TargetAnswer,
});
export type PronounTarget = z.infer<typeof PronounTarget>;
