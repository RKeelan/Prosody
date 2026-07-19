/**
 * Shared schema primitives used across every section of a pack.
 *
 * Two ideas recur throughout the pack and live here so the rest of the schema
 * can lean on them:
 *
 *   - Quote anchors (W3C TextQuoteSelector): reference spans are stored as quoted
 *     text plus enough context to locate them, never as character offsets. An LLM
 *     author can quote a poem reliably; it cannot count characters. Anchors resolve
 *     to token indices at load (Task 2), and grading then happens in token space.
 *   - The answer-key pattern: everywhere the app auto-grades, a reference answer
 *     may admit acceptable variants. `answerKey` expresses that once—a required
 *     `answer` plus an `alternates` list—so every graded activity shares it.
 */

import { z } from "zod";

/** A string that must carry at least one character. */
export const nonEmptyString = z.string().min(1);

/**
 * A one-line string: non-empty and free of newlines. Used for the short
 * reference notes the UI renders on a single line (deviation notes, device
 * function notes, sentence paraphrases).
 */
export const singleLineString = nonEmptyString.refine((s) => !s.includes("\n"), {
  message: "must be a single line (no newlines)",
});

/** A lowercase, hyphen-separated identifier (e.g. a pack id or device id). */
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase, hyphen-separated slug");

/**
 * A reference span, after the W3C TextQuoteSelector pattern: the `exact` quoted
 * text, disambiguated when it repeats either by surrounding `prefix`/`suffix`
 * context or by a 1-based `occurrence` index—one strategy or the other, not
 * both. A bare `exact` is valid when the quote is already unique in the poem.
 */
export const QuoteAnchor = z
  .object({
    /** The exact text as it appears in the poem. */
    exact: nonEmptyString,
    /** Text immediately preceding `exact`, used to disambiguate repeats. */
    prefix: z.string().optional(),
    /** Text immediately following `exact`, used to disambiguate repeats. */
    suffix: z.string().optional(),
    /** 1-based index selecting which occurrence of `exact` is meant. */
    occurrence: z.number().int().positive().optional(),
  })
  .refine((a) => a.occurrence === undefined || (a.prefix === undefined && a.suffix === undefined), {
    message: "disambiguate with prefix/suffix or an occurrence index, not both",
    path: ["occurrence"],
  });
export type QuoteAnchor = z.infer<typeof QuoteAnchor>;

/**
 * The reusable auto-grading affordance: a canonical `answer` plus a list of
 * `alternates` graded as equivalent to it. `alternates` defaults to empty, for
 * the common case where the poem admits exactly one reading. Wrap whatever the
 * activity grades—a span/typed target, a stress value, a syllable count.
 */
export function answerKey<T extends z.ZodType>(inner: T) {
  return z.object({
    /** The canonical reference answer. */
    answer: inner,
    /** Further answers accepted as equivalent to `answer`. */
    alternates: z.array(inner).default([]),
  });
}

/**
 * What a learner can point at when resolving a pronoun or naming a sentence
 * part: either a span in the poem (`span`) or free text (`text`) for implied or
 * extratextual referents such as "(implied) the traveller".
 */
export const AnswerTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("span"), anchor: QuoteAnchor }),
  z.object({ kind: z.literal("text"), text: nonEmptyString }),
]);
export type AnswerTarget = z.infer<typeof AnswerTarget>;

/** An answer key over {@link AnswerTarget}: a span-or-typed answer with alternates. */
export const TargetAnswer = answerKey(AnswerTarget);
export type TargetAnswer = z.infer<typeof TargetAnswer>;
