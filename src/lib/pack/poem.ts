/**
 * The poem text: stanzas of lines, plus the sparse per-word syllable divisions
 * scansion needs.
 *
 * Lines are stored as their exact raw text (punctuation included) so quote
 * anchors resolve against the real surface of the poem; the tokeniser (Task 2)
 * splits words and punctuation from these strings. Stanza breaks are structural
 *—a blank line between stanzas is expressed by the stanza grouping, not by an
 * empty line string.
 */

import { z } from "zod";
import { nonEmptyString, QuoteAnchor } from "./common";

/** One stanza: an ordered, non-empty list of line texts. */
export const Stanza = z.object({
  lines: z.array(nonEmptyString).min(1),
});
export type Stanza = z.infer<typeof Stanza>;

/**
 * How a single word divides into syllables. The word is located by anchor; the
 * syllables are its parts in order.
 *
 * $Claude Activity 2 renders each word as tappable syllable chips, so every word
 * of more than one syllable needs an entry here—the renderer and grader read
 * these divisions, and a word without one is taken as a single syllable, which
 * the validator's scansion line-count check then flags. Monosyllables need no
 * entry. Divisions are the natural ones, except where the metre elides ("trav-
 * eller" as two, "O-zy-man-dias" as four), which the paired elision
 * micro-questions surface.
 *
 * Plan.md files syllable divisions under "poem text", so they live here rather
 * than under scansion, even though Activity 2 is what consumes them.
 */
export const Syllabification = z.object({
  word: QuoteAnchor,
  syllables: z.array(nonEmptyString).min(1),
});
export type Syllabification = z.infer<typeof Syllabification>;

export const Poem = z.object({
  stanzas: z.array(Stanza).min(1),
  syllabifications: z.array(Syllabification).default([]),
});
export type Poem = z.infer<typeof Poem>;
