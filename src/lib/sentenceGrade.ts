/**
 * Grading for Activity 4 (subject, verb, object).
 *
 * Each sentence has four gradable parts, and Vision.md fixes how each is judged:
 * span answers are auto-checked, "no object" is checked against the pack's
 * record, and the paraphrase is self-graded against the reference. A sentence is
 * *cleared* only when subject, verb, object-or-complement, and paraphrase all
 * pass.
 *
 * The two answer routes grade exactly as Activity 3's do—a span is checked at
 * token granularity (exact if it covers the same tokens, overlap if it shares
 * any, miss if it touches none; both exact and overlap pass), and typed text is
 * self-graded match/partial/miss after the reference is revealed. The object
 * slot adds the "no object" axis: the learner's "no object" is right only when
 * the pack records no object, and naming an object the pack calls absent (or
 * calling absent one it records) is a miss. This module resolves the references
 * once and grades purely in token space; the component owns the pixels and the
 * self-grade taps.
 */

import { resolveAnchor } from "./anchor";
import { sameSpan, spansOverlap, type TokenSpan } from "./grade";
import type { ObjectSlot, Sentence } from "./pack";
import type { TargetAnswer } from "./pack/common";
import type {
  ObjectAnswer,
  PartResponse,
  SentenceAnswer,
  SentenceResponse,
} from "./sentenceAnswer";
import { responseFor } from "./sentenceAnswer";
import type { Token } from "./tokenise";

/** The four gradable parts of a sentence, and the key self-grades are keyed by. */
export type Slot = "subject" | "verb" | "object" | "paraphrase";

/** The four slots in the order they read and render. */
export const SLOTS: readonly Slot[] = ["subject", "verb", "object", "paraphrase"];

/** A reference target resolved for grading: its span answers and its typed answers. */
export interface ResolvedTarget {
  /** Every span-typed reference target (canonical + alternates), resolved to token spans. */
  readonly spans: readonly TokenSpan[];
  /** Every text-typed reference target (canonical + alternates), as written. */
  readonly texts: readonly string[];
}

/** The object slot's reference: "no object", or a resolved target when present. */
export type ReferenceObject =
  | { readonly kind: "none" }
  | { readonly kind: "present"; readonly target: ResolvedTarget };

/** One sentence's references, resolved once for grading. */
export interface ReferenceSentence {
  readonly subject: ResolvedTarget;
  readonly verb: ResolvedTarget;
  readonly object: ReferenceObject;
}

/**
 * Resolve a {@link TargetAnswer} into its reference spans and texts. Span targets
 * that fail to resolve are dropped—the validator reports those, so grading treats
 * a broken pack as "no such reference span" rather than throwing mid-session.
 */
export function resolveTarget(tokens: readonly Token[], target: TargetAnswer): ResolvedTarget {
  const spans: TokenSpan[] = [];
  const texts: string[] = [];
  for (const t of [target.answer, ...target.alternates]) {
    if (t.kind === "span") {
      const result = resolveAnchor(tokens, t.anchor);
      if (result.status === "resolved") spans.push(result.span);
    } else {
      texts.push(t.text);
    }
  }
  return { spans, texts };
}

/** Resolve one pack sentence's parts into references for grading. */
export function resolveSentence(tokens: readonly Token[], sentence: Sentence): ReferenceSentence {
  return {
    subject: resolveTarget(tokens, sentence.subject),
    verb: resolveTarget(tokens, sentence.verb),
    object: resolveObject(tokens, sentence.object),
  };
}

function resolveObject(tokens: readonly Token[], object: ObjectSlot): ReferenceObject {
  return object.kind === "none"
    ? { kind: "none" }
    : { kind: "present", target: resolveTarget(tokens, object.target) };
}

/** How a learner's span answer measured up: same tokens, some shared, or none. */
export type SpanOutcome = "exact" | "overlap" | "miss";

/** Grade a span answer against a reference's spans. Exact beats overlap beats miss. */
export function gradeSpan(learner: TokenSpan, reference: ResolvedTarget): SpanOutcome {
  if (reference.spans.some((span) => sameSpan(span, learner))) return "exact";
  if (reference.spans.some((span) => spansOverlap(span, learner))) return "overlap";
  return "miss";
}

/** The learner's verdict on their own typed answer, shown beside the reference. */
export type SelfGrade = "match" | "partial" | "miss";

/**
 * One part's outcome. Span answers land on an auto {@link SpanOutcome}; typed
 * answers take the learner's {@link SelfGrade}, or `ungraded` until they judge it;
 * a "no object" answer is auto `exact`/`miss` against the record; an unanswered
 * part is `unanswered`.
 */
export type PartOutcome = SpanOutcome | SelfGrade | "unanswered" | "ungraded";

/** Whether an outcome counts as a pass toward clearing the sentence. */
export function outcomeIsCorrect(outcome: PartOutcome): boolean {
  return outcome === "exact" || outcome === "overlap" || outcome === "match";
}

/**
 * Whether an outcome belongs on the miss list the Activity 9 gate makes the
 * learner clear or dismiss. An outright miss and an unanswered part are misses; a
 * self-graded `partial` is partial credit, and an `ungraded` typed answer still
 * awaits the learner's verdict—neither is a miss.
 */
export function outcomeIsMiss(outcome: PartOutcome): boolean {
  return outcome === "miss" || outcome === "unanswered";
}

/** Grade a subject or verb part from its response and the learner's self-grade, if any. */
export function partOutcome(
  response: PartResponse | undefined,
  reference: ResolvedTarget,
  selfGrade: SelfGrade | undefined,
): PartOutcome {
  if (!response) return "unanswered";
  if (response.kind === "span") return gradeSpan(response.span, reference);
  return selfGrade ?? "ungraded";
}

/**
 * Grade the object slot. "No object" is right only against a `none` record;
 * naming an object the record calls absent, or calling absent one it records, is
 * a miss. A present span/text grades like any other part.
 */
export function objectOutcome(
  answer: ObjectAnswer | undefined,
  reference: ReferenceObject,
  selfGrade: SelfGrade | undefined,
): PartOutcome {
  if (!answer) return "unanswered";
  if (reference.kind === "none") {
    // The record has no object: only "no object" is right.
    return answer.kind === "none" ? "exact" : "miss";
  }
  // The record has an object: "no object" misses it; a span/text grades normally.
  if (answer.kind === "none") return "miss";
  return partOutcome(answer, reference.target, selfGrade);
}

/** A part that landed on the miss list, tagged with which slot it was. */
export interface SlotMiss {
  readonly slot: Slot;
  readonly outcome: PartOutcome;
}

/** One sentence's graded result. */
export interface SentenceResult {
  readonly subject: PartOutcome;
  readonly verb: PartOutcome;
  readonly object: PartOutcome;
  readonly paraphrase: PartOutcome;
  /** True when all four parts pass. */
  readonly cleared: boolean;
  /** The parts that belong on the gate's miss list. */
  readonly misses: readonly SlotMiss[];
}

/** The whole activity's grade: how many sentences cleared, and per-sentence results. */
export interface SentencesGrade {
  readonly total: number;
  readonly cleared: number;
  readonly results: readonly SentenceResult[];
}

/** The self-grade key for a sentence's slot, shared by the store's miss ids and React state. */
export function selfGradeKey(index: number, slot: Slot): string {
  return `${index}:${slot}`;
}

/**
 * Grade one sentence from its references, the learner's response, and their
 * self-grades (keyed by {@link selfGradeKey}). The paraphrase is always
 * self-graded: present but unjudged reads `ungraded`, absent reads `unanswered`.
 */
export function gradeSentence(
  reference: ReferenceSentence,
  response: SentenceResponse,
  selfGrade: (slot: Slot) => SelfGrade | undefined,
): SentenceResult {
  const subject = partOutcome(response.subject, reference.subject, selfGrade("subject"));
  const verb = partOutcome(response.verb, reference.verb, selfGrade("verb"));
  const object = objectOutcome(response.object, reference.object, selfGrade("object"));
  const paraphrase = paraphraseOutcome(response.paraphrase, selfGrade("paraphrase"));

  const outcomes: readonly [Slot, PartOutcome][] = [
    ["subject", subject],
    ["verb", verb],
    ["object", object],
    ["paraphrase", paraphrase],
  ];
  return {
    subject,
    verb,
    object,
    paraphrase,
    cleared: outcomes.every(([, outcome]) => outcomeIsCorrect(outcome)),
    misses: outcomes.flatMap(([slot, outcome]) =>
      outcomeIsMiss(outcome) ? [{ slot, outcome }] : [],
    ),
  };
}

/** The paraphrase's outcome: always self-graded, `unanswered` when blank. */
function paraphraseOutcome(
  paraphrase: string | undefined,
  selfGrade: SelfGrade | undefined,
): PartOutcome {
  if (paraphrase === undefined) return "unanswered";
  return selfGrade ?? "ungraded";
}

/**
 * Grade every sentence from the references, the learner's answers, and their
 * self-grades (keyed by {@link selfGradeKey}). The cleared count is the score the
 * store records; each sentence's misses feed the Activity 9 gate.
 */
export function gradeSentences(
  references: readonly ReferenceSentence[],
  answer: SentenceAnswer,
  selfGrades: Readonly<Record<string, SelfGrade>>,
): SentencesGrade {
  const results = references.map((reference, i) =>
    gradeSentence(reference, responseFor(answer, i), (slot) => selfGrades[selfGradeKey(i, slot)]),
  );
  return {
    total: references.length,
    cleared: results.filter((r) => r.cleared).length,
    results,
  };
}
