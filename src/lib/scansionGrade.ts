/**
 * Grading for Activity 2 (read aloud): stress and rhyme.
 *
 * Stress grading is split-aware. The learner divides each word into syllables
 * themselves, so a syllable's stress can only be credited once the division is
 * right—getting the syllabification wrong means the stresses have nowhere to
 * land. Each word is therefore graded against its reference division and stress:
 * if the learner's breaks match, every syllable's mark is diffed with the answer
 * key's alternates accepted; if the breaks differ, the word's syllables all read
 * as mismatches and the reveal flags the division itself. The headline result is
 * percent agreement over reference syllables.
 *
 * Rhyme is graded as a partition of line ends, never as letters: a learner who
 * labels ABAB as BABA is right, because both induce the same grouping.
 */

import type { ScansionLine, Stress, StressAnswer } from "./pack/scansion";
import { type ScansionAnswer, type StressMark, splitFor } from "./scansionAnswer";
import type { LineSyllables } from "./syllables";

export type { StressMark };

/** True when a stress value is the reference answer or one of its alternates. */
export function isStressAccepted(answer: StressAnswer, mark: Stress): boolean {
  return mark === answer.answer || answer.alternates.includes(mark);
}

/** One word's reference scansion: its syllables, the breaks they imply, and each syllable's stress. */
export interface ReferenceWord {
  readonly tokenIndex: number;
  readonly text: string;
  readonly syllables: readonly string[];
  /** Break positions the reference syllabification implies, for comparing divisions. */
  readonly breaks: readonly number[];
  readonly stress: readonly StressAnswer[];
}

/** The break positions a run of syllable chunks implies: the prefix sums, last excluded. */
function breaksOf(syllables: readonly string[]): number[] {
  const breaks: number[] = [];
  let at = 0;
  for (let i = 0; i < syllables.length - 1; i++) {
    at += syllables[i].length;
    breaks.push(at);
  }
  return breaks;
}

/**
 * Build the reference word list from the poem's syllable projection and the
 * scansion lines: each word carries its reference syllables and the stress
 * answers those syllables take, sliced out of the line by the word's position.
 */
export function referenceWords(
  lineSyllables: readonly LineSyllables[],
  scansionLines: readonly ScansionLine[],
): ReferenceWord[] {
  const words: ReferenceWord[] = [];
  for (const line of lineSyllables) {
    const lineStress = scansionLines[line.lineIndex]?.syllables ?? [];
    for (const word of line.words) {
      words.push({
        tokenIndex: word.tokenIndex,
        text: word.text,
        syllables: word.syllables,
        breaks: breaksOf(word.syllables),
        stress: lineStress.slice(word.syllableStart, word.syllableStart + word.syllables.length),
      });
    }
  }
  return words;
}

/** True when two break lists cover exactly the same positions. */
function sameBreaks(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** One syllable's outcome: the learner's mark matched, missed, or was never made. */
export type CellGrade = "correct" | "mismatch" | "unmarked";

/** One word's grade: whether its division was right, and each reference syllable's outcome. */
export interface WordGrade {
  readonly tokenIndex: number;
  readonly splitCorrect: boolean;
  readonly cells: readonly CellGrade[];
}

export interface StressGrade {
  /** Total reference syllables across every word. */
  readonly total: number;
  /** Syllables the learner divided right and marked acceptably. */
  readonly correct: number;
  readonly words: readonly WordGrade[];
}

/**
 * Grade the learner's divisions and stress against the reference words. A word
 * whose breaks differ from the reference scores every syllable as a mismatch,
 * since a wrong division leaves the stresses unaligned; a word divided right has
 * each syllable diffed, with the answer key's alternates accepted and an
 * unmarked syllable counted a miss.
 */
export function gradeStress(
  reference: readonly ReferenceWord[],
  answer: ScansionAnswer,
): StressGrade {
  let total = 0;
  let correct = 0;
  const words = reference.map((ref) => {
    const learner = splitFor(answer, ref.tokenIndex);
    const splitCorrect = sameBreaks(learner.breaks, ref.breaks);
    const cells = ref.stress.map((answerKey, si): CellGrade => {
      total += 1;
      if (!splitCorrect) return "mismatch";
      const mark = learner.stress[si] ?? null;
      if (mark === null) return "unmarked";
      if (isStressAccepted(answerKey, mark)) {
        correct += 1;
        return "correct";
      }
      return "mismatch";
    });
    return { tokenIndex: ref.tokenIndex, splitCorrect, cells };
  });
  return { total, correct, words };
}

/** Percent agreement, rounded to a whole number; 0 when there is nothing to grade. */
export function stressAgreement(grade: StressGrade): number {
  return grade.total === 0 ? 0 : Math.round((grade.correct / grade.total) * 100);
}

export interface RhymeGrade {
  /** True when the learner's grouping matches the reference partition exactly. */
  readonly matches: boolean;
  /** Per line, whether its grouping matches the reference. */
  readonly lineCorrect: readonly boolean[];
  /** Per line, the 0-based reference group it belongs to—for colour-coding on reveal. */
  readonly referenceGroupOf: readonly number[];
}

/**
 * A line's group representative: the smallest line index sharing its label. A
 * null (unassigned) label makes the line its own singleton, since the learner
 * has not asserted it rhymes with anything.
 */
function labelRepresentatives(labels: readonly (string | null)[]): number[] {
  return labels.map((label, i) => {
    if (label === null) return i;
    const first = labels.indexOf(label);
    return first === -1 ? i : first;
  });
}

/** Each line's 0-based reference group index, from the reference partition. */
function referenceGroups(reference: readonly (readonly number[])[], lineCount: number): number[] {
  const group = new Array<number>(lineCount).fill(-1);
  reference.forEach((lines, groupIndex) => {
    for (const line of lines) {
      if (line >= 0 && line < lineCount) group[line] = groupIndex;
    }
  });
  return group;
}

/**
 * Grade rhyme as a partition. The learner's labels and the reference partition
 * each induce an equivalence relation on line indices; the two agree on a line
 * when every other line groups-with-it under one relation exactly when it does
 * under the other. Letters never matter—only the grouping does.
 */
export function gradeRhyme(
  reference: readonly (readonly number[])[],
  labels: readonly (string | null)[],
  lineCount: number,
): RhymeGrade {
  const learnerRep = labelRepresentatives(labels);
  const refGroup = referenceGroups(reference, lineCount);
  const lineCorrect: boolean[] = [];
  for (let i = 0; i < lineCount; i++) {
    let ok = true;
    for (let j = 0; j < lineCount; j++) {
      const sameRef = refGroup[i] === refGroup[j];
      const sameLearner = learnerRep[i] === learnerRep[j];
      if (sameRef !== sameLearner) {
        ok = false;
        break;
      }
    }
    lineCorrect.push(ok);
  }
  return { matches: lineCorrect.every(Boolean), lineCorrect, referenceGroupOf: refGroup };
}
