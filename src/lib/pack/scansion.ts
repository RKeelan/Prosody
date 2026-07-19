/**
 * Activity 2 (read aloud): the reference scansion.
 *
 * Stress is binary, marked per syllable through the answer-key pattern so a
 * syllable can accept a promoted stress or a spondee-versus-iamb call. Rhyme is
 * stored as a partition of line ends, not as letters, because grading compares
 * partitions—a learner who labels ABAB as BABA is right. Deviations and
 * elision micro-questions round out what the activity reveals on commit.
 */

import { z } from "zod";
import { answerKey, nonEmptyString, QuoteAnchor, singleLineString } from "./common";

/** Binary metrical stress on a syllable. */
export const Stress = z.enum(["stressed", "unstressed"]);
export type Stress = z.infer<typeof Stress>;

/** The reference stress for one syllable, with any acceptable alternates. */
export const StressAnswer = answerKey(Stress);
export type StressAnswer = z.infer<typeof StressAnswer>;

/** One line's scansion: its syllables in order, each a stress answer key. */
export const ScansionLine = z.object({
  syllables: z.array(StressAnswer).min(1),
});
export type ScansionLine = z.infer<typeof ScansionLine>;

/** A departure from the base metre, anchored to the poem with a one-line note. */
export const Deviation = z.object({
  anchor: QuoteAnchor,
  note: singleLineString,
});
export type Deviation = z.infer<typeof Deviation>;

/**
 * An elision micro-question, asked before the tap phase where the metre hinges
 * on how many syllables a word carries. The count is an answer key, so both an
 * elided and an expanded reading can be accepted where the poem allows it.
 */
export const ElisionQuestion = z.object({
  anchor: QuoteAnchor,
  prompt: nonEmptyString,
  syllableCount: answerKey(z.number().int().positive()),
});
export type ElisionQuestion = z.infer<typeof ElisionQuestion>;

export const Scansion = z.object({
  /** The base metre's name, e.g. "iambic tetrameter". */
  metreName: nonEmptyString,
  /** Per-line scansion, in the poem's global line order. */
  lines: z.array(ScansionLine).min(1),
  deviations: z.array(Deviation).default([]),
  /**
   * Rhyme as a partition of line ends: each inner array groups the global,
   * 0-based line indices that rhyme together; an unrhymed line stands alone in
   * its own group. Graded as a partition, so the choice of letters never
   * matters.
   */
  rhyme: z.array(z.array(z.number().int().nonnegative())).default([]),
  elisionQuestions: z.array(ElisionQuestion).default([]),
});
export type Scansion = z.infer<typeof Scansion>;
