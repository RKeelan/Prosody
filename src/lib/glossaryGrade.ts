/**
 * Grading for Activity 5 (gloss the diction).
 *
 * The activity turns on the poem's *loaded words*—the ones it uses in two senses
 * at once (Ozymandias's "mocked", "survive", "read"). The pack flags them, and
 * the app highlights them from the start: defining an ordinary hard word is the
 * least interesting part of glossing for a capable reader, so the load-bearing
 * exercise is working out both senses a loaded word carries. The pack's plain
 * essential-vocabulary entries carry no weight here.
 *
 * Each loaded word is answered by the learner writing its two senses, and graded
 * the way every self-graded answer in this tool is: the app shows the reference's
 * two senses beside the learner's after commit, and they mark their own match,
 * partial, or miss, because a definition is not something the app can judge. The
 * score counts the loaded words judged a match of the total; a loaded word left
 * unaddressed or self-judged a miss feeds the session summary.
 *
 * This module resolves each loaded word to its token span once and grades in token
 * space; the component owns the pixels and the self-grade taps.
 */

import { resolveAnchor } from "./anchor";
import type { GlossaryAnswer } from "./glossaryAnswer";
import { glossFor } from "./glossaryAnswer";
import type { TokenSpan } from "./grade";
import type { GlossaryEntry } from "./pack";
import type { Token } from "./tokenise";

/** A loaded word resolved for grading: where it sits, and the two senses it carries. */
export interface LoadedWord {
  /** The word's location(s) in the poem; empty when its anchor does not resolve. */
  readonly spans: readonly TokenSpan[];
  /** The reference senses the word carries at once (two, for a loaded word). */
  readonly senses: readonly string[];
}

/**
 * Resolve one glossary entry into a loaded word. A word whose anchor fails to
 * resolve keeps no span—the validator already reports that, so grading treats a
 * broken pack as "nowhere to gloss" rather than throwing mid-session.
 */
export function resolveLoadedWord(tokens: readonly Token[], entry: GlossaryEntry): LoadedWord {
  const result = resolveAnchor(tokens, entry.word);
  return {
    spans: result.status === "resolved" ? [result.span] : [],
    senses: entry.senses,
  };
}

/** Whether the learner has written a gloss for any token this word covers. */
export function wordAnswered(answer: GlossaryAnswer, word: LoadedWord): boolean {
  for (const span of word.spans) {
    for (let t = span.start; t < span.end; t++) {
      if (glossFor(answer, t)) return true;
    }
  }
  return false;
}

/** The learner's verdict on their own reading, shown beside the reference senses. */
export type SelfGrade = "match" | "partial" | "miss";

/**
 * One loaded word's outcome. Unaddressed until the learner writes a sense, then
 * `ungraded` until they judge it against the revealed reference.
 */
export type LoadedOutcome = "unanswered" | "ungraded" | SelfGrade;

/** Grade one loaded word from whether it was addressed and the learner's self-grade. */
export function loadedOutcome(answered: boolean, selfGrade: SelfGrade | undefined): LoadedOutcome {
  if (!answered) return "unanswered";
  return selfGrade ?? "ungraded";
}

/** Whether an outcome counts toward the score. */
export function outcomeIsCorrect(outcome: LoadedOutcome): boolean {
  return outcome === "match";
}

/**
 * Whether an outcome belongs on the miss list the session summary shows. A loaded
 * word left unaddressed and one the learner judged a miss are misses; a `partial`
 * is partial credit and an `ungraded` word still awaits the learner's verdict.
 */
export function outcomeIsMiss(outcome: LoadedOutcome): boolean {
  return outcome === "miss" || outcome === "unanswered";
}

/** One loaded word's graded result. */
export interface LoadedResult {
  readonly outcome: LoadedOutcome;
  /** Counts toward the score. */
  readonly correct: boolean;
  /** Belongs on the miss list. */
  readonly miss: boolean;
}

/** The whole activity's grade: the matched count of the total, and per-word results. */
export interface GlossaryGrade {
  /** How many loaded words the pack flags. */
  readonly total: number;
  /** How many the learner addressed and self-judged a match. */
  readonly correct: number;
  /** One result per loaded word, in pack order. */
  readonly results: readonly LoadedResult[];
}

/**
 * Grade every loaded word from the references, the learner's answer, and their
 * self-grades (keyed by the word's index in the loaded list). Whether a word was
 * addressed is read from the answer, so it survives a reload; self-grades are
 * reconstructed by the component from the persisted miss list.
 */
export function gradeLoadedWords(
  references: readonly LoadedWord[],
  answer: GlossaryAnswer,
  selfGrades: Readonly<Record<number, SelfGrade>>,
): GlossaryGrade {
  const results = references.map((word, i): LoadedResult => {
    const outcome = loadedOutcome(wordAnswered(answer, word), selfGrades[i]);
    return { outcome, correct: outcomeIsCorrect(outcome), miss: outcomeIsMiss(outcome) };
  });
  return {
    total: references.length,
    correct: results.filter((r) => r.correct).length,
    results,
  };
}
