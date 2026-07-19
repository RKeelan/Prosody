/**
 * Activity 4 (subject, verb, object): sentence segmentation with the parts of
 * each sentence and a reference paraphrase.
 *
 * Subject, verb, and object are all answered by span or typed text, so they use
 * {@link TargetAnswer}. The object slot makes "no object" first-class, for the
 * intransitives and copulars where forcing an object would be wrong. Gnarly
 * sentences carry a clause tree the learner reconstructs.
 */

import { z } from "zod";
import { nonEmptyString, QuoteAnchor, singleLineString, TargetAnswer } from "./common";

/**
 * A node in a sentence's clause-nesting tree. Recursive: a clause may contain
 * nested clauses. `label` names the clause; `anchor` optionally ties it to the
 * text; `children` are its subordinate clauses.
 */
export interface ClauseNode {
  label: string;
  anchor?: z.infer<typeof QuoteAnchor>;
  children?: ClauseNode[];
}
export const ClauseTree: z.ZodType<ClauseNode> = z.lazy(() =>
  z.object({
    label: nonEmptyString,
    anchor: QuoteAnchor.optional(),
    children: z.array(ClauseTree).optional(),
  }),
);

/**
 * The object-or-complement slot. Either the sentence has none ("no object" as a
 * first-class answer for intransitives and copulars) or it has one, answered
 * like any other part through the answer-key pattern.
 */
export const ObjectSlot = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("present"), target: TargetAnswer }),
]);
export type ObjectSlot = z.infer<typeof ObjectSlot>;

export const Sentence = z.object({
  /** The whole sentence's text, spanning lines as needed. */
  anchor: QuoteAnchor,
  subject: TargetAnswer,
  verb: TargetAnswer,
  object: ObjectSlot,
  /** The reference "who does what to whom" paraphrase, in plain word order. */
  paraphrase: singleLineString,
  /**
   * Present only for sentences the pack flags as gnarly: the reference clause
   * tree the learner rebuilds. Its presence is the gnarly flag.
   */
  gnarly: ClauseTree.optional(),
});
export type Sentence = z.infer<typeof Sentence>;
