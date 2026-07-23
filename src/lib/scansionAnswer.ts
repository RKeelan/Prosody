/**
 * Activity 2's answer payload: the learner's own syllable divisions and stress
 * marks, plus their rhyme labels, with the pure builders and editors the UI
 * drives them through.
 *
 * The learner splits each word into syllables themselves—syllabification is part
 * of scansion skill (elision, expansion, is-this-one-syllable-or-two), and doing
 * it by hand keeps the reference count hidden until commit. So a word's answer is
 * where the learner placed its breaks and the stress they gave each resulting
 * syllable; a word they never touch stays a single unmarked syllable. The store
 * holds this as opaque data (`ActivityState.answers` is `unknown`); this module
 * owns the shape and every transition, and {@link coerceScansionAnswer} rebuilds
 * it defensively from whatever storage returns. Editors return a fresh answer and
 * never mutate, matching the store's write-through model.
 */

import type { Stress } from "./pack/scansion";

/** A learner's mark on one syllable: a stress value, or null when unmarked. */
export type StressMark = Stress | null;

/** One word's learner scansion: where it breaks into syllables, and each syllable's stress. */
export interface WordSplit {
  /** Break positions in the word text: sorted, unique, each in [1, length − 1]. */
  readonly breaks: readonly number[];
  /** Stress per syllable in order; length is always breaks.length + 1. */
  readonly stress: readonly StressMark[];
}

export interface ScansionAnswer {
  /**
   * Learner splits, keyed by the word's token index. A word absent here is its
   * default: one whole, unmarked syllable. Only touched words are stored.
   */
  readonly words: Readonly<Record<number, WordSplit>>;
  /** Per line: the rhyme letter assigned to the line's end, or null. */
  readonly rhyme: readonly (string | null)[];
}

/** The default split for an untouched word: whole, one unmarked syllable. */
const WHOLE_WORD: WordSplit = { breaks: [], stress: [null] };

/** Split a word's text at the given break positions into syllable strings. */
export function segmentsOf(text: string, breaks: readonly number[]): string[] {
  const sorted = [...breaks].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  for (const at of sorted) {
    parts.push(text.slice(start, at));
    start = at;
  }
  parts.push(text.slice(start));
  return parts;
}

/** The learner's split for a word, or the default whole-word single syllable. */
export function splitFor(answer: ScansionAnswer, tokenIndex: number): WordSplit {
  return answer.words[tokenIndex] ?? WHOLE_WORD;
}

/** A blank answer: no word touched, every line end unassigned. */
export function emptyScansionAnswer(lineCount: number): ScansionAnswer {
  return { words: {}, rhyme: new Array<string | null>(lineCount).fill(null) };
}

/** A stress value read from unknown data, or null for anything else. */
function coerceMark(value: unknown): StressMark {
  return value === "stressed" || value === "unstressed" ? value : null;
}

/**
 * Rebuild an answer from `raw`, keeping only what is well-formed for the current
 * poem: word entries whose token index is a real word, breaks in range, and a
 * stress array re-sized to the resulting syllable count. `wordLengths` maps each
 * word token index to its text length, so breaks can be range-checked. This is
 * the only entry point that trusts `raw`, so every value it keeps is re-checked.
 */
export function coerceScansionAnswer(
  raw: unknown,
  wordLengths: ReadonlyMap<number, number>,
  lineCount: number,
): ScansionAnswer {
  const source = (raw ?? {}) as { words?: unknown; rhyme?: unknown };
  const rawWords =
    source.words && typeof source.words === "object"
      ? (source.words as Record<string, unknown>)
      : {};

  const words: Record<number, WordSplit> = {};
  for (const [tokenIndex, length] of wordLengths) {
    const entry = rawWords[tokenIndex] as { breaks?: unknown; stress?: unknown } | undefined;
    if (!entry) continue;
    const breaks = Array.isArray(entry.breaks)
      ? [
          ...new Set(
            entry.breaks.filter(
              (b): b is number => Number.isInteger(b) && b >= 1 && b <= length - 1,
            ),
          ),
        ].sort((a, b) => a - b)
      : [];
    const rawStress = Array.isArray(entry.stress) ? entry.stress : [];
    const stress = Array.from({ length: breaks.length + 1 }, (_, i) => coerceMark(rawStress[i]));
    // Store only a word the learner actually changed, so `words` stays a sparse
    // record of real edits and an untouched word reads through WHOLE_WORD.
    if (breaks.length > 0 || stress.some((s) => s !== null)) {
      words[tokenIndex] = { breaks, stress };
    }
  }

  const rawRhyme = Array.isArray(source.rhyme) ? source.rhyme : [];
  const rhyme = Array.from({ length: lineCount }, (_, i) =>
    typeof rawRhyme[i] === "string" ? (rawRhyme[i] as string) : null,
  );
  return { words, rhyme };
}

/** The next stress state in the tap cycle: unmarked → stressed → unstressed → unmarked. */
function nextMark(mark: StressMark): StressMark {
  if (mark === null) return "stressed";
  if (mark === "stressed") return "unstressed";
  return null;
}

/** Write one word's split back into an answer, immutably. */
function withWord(answer: ScansionAnswer, tokenIndex: number, split: WordSplit): ScansionAnswer {
  return { ...answer, words: { ...answer.words, [tokenIndex]: split } };
}

/**
 * Toggle a syllable break at `position` within a word. Changing a word's
 * division blanks its stress marks—the learner settles the split first, then
 * marks the syllables it produced—so the stress array always matches the
 * current syllable count.
 */
export function toggleBreak(
  answer: ScansionAnswer,
  tokenIndex: number,
  position: number,
): ScansionAnswer {
  const current = splitFor(answer, tokenIndex);
  const has = current.breaks.includes(position);
  const breaks = has
    ? current.breaks.filter((b) => b !== position)
    : [...current.breaks, position].sort((a, b) => a - b);
  return withWord(answer, tokenIndex, {
    breaks,
    stress: new Array<StressMark>(breaks.length + 1).fill(null),
  });
}

/** Cycle one syllable's stress within a word to the next state in the tap cycle. */
export function cycleSegmentStress(
  answer: ScansionAnswer,
  tokenIndex: number,
  segment: number,
): ScansionAnswer {
  const current = splitFor(answer, tokenIndex);
  if (segment < 0 || segment >= current.stress.length) return answer;
  const stress = current.stress.slice();
  stress[segment] = nextMark(stress[segment]);
  return withWord(answer, tokenIndex, { ...current, stress });
}

/**
 * Assign a rhyme letter to a line end, or clear it when the same letter is
 * assigned again—so the active "pen" both paints and un-paints with one tap.
 */
export function toggleRhyme(answer: ScansionAnswer, line: number, letter: string): ScansionAnswer {
  if (line < 0 || line >= answer.rhyme.length) return answer;
  const rhyme = answer.rhyme.slice();
  rhyme[line] = rhyme[line] === letter ? null : letter;
  return { ...answer, rhyme };
}

/** How many words the learner has marked at least one stress on, and how many words there are. */
export function wordProgress(
  answer: ScansionAnswer,
  totalWords: number,
): { marked: number; total: number } {
  let marked = 0;
  for (const split of Object.values(answer.words)) {
    if (split.stress.some((s) => s !== null)) marked += 1;
  }
  return { marked, total: totalWords };
}
