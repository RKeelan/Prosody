/**
 * Grading for Activity 3 (resolve pronouns and demonstratives).
 *
 * A pronoun's reference antecedent is a {@link TargetAnswer}: a canonical answer
 * plus alternates, each either a span (a place in the poem) or typed text (an
 * implied or extratextual referent). The two answer routes grade differently, as
 * Vision.md prescribes:
 *
 *   - A span answer is auto-checked against the reference spans at token
 *     granularity—exact if it covers the same tokens, overlap if it shares any,
 *     miss if it touches none. Both exact and overlap count as resolved (a
 *     trailing article or a clipped edge should not fail an antecedent), so a
 *     learner who lands on the right stretch of poem is credited without the app
 *     pretending to judge implied referents it cannot see.
 *   - A typed answer is self-graded. The reference is shown beside the learner's
 *     text after commit and they mark it match, partial, or miss; the app records
 *     the verdict, it does not invent one.
 *
 * Alternates carry the poem's genuine ambiguities (Ozymandias's "hand"—the
 * sculptor's or the king's), so a span that matches any reference span, canonical
 * or alternate, is correct. This module resolves the reference once and grades
 * purely in token space; the component owns the pixels and the self-grade taps.
 */

import { resolveAnchor } from "./anchor";
import { sameSpan, spansOverlap, type TokenSpan } from "./grade";
import type { TargetAnswer } from "./pack/common";
import type { PronounAnswer, PronounResponse } from "./pronounAnswer";
import { responseFor } from "./pronounAnswer";
import type { Token } from "./tokenise";

/** A pronoun's reference antecedent, resolved for grading. */
export interface ReferenceAntecedent {
  /** Every span-typed reference target (canonical + alternates), resolved to token spans. */
  readonly spans: readonly TokenSpan[];
  /** Every text-typed reference target (canonical + alternates), as written. */
  readonly texts: readonly string[];
}

/**
 * Resolve one pronoun's antecedent into its reference spans and texts. Span
 * targets that fail to resolve are dropped—the validator already reports those,
 * so grading treats a broken pack as "no such reference span" rather than
 * throwing mid-session.
 */
export function resolveAntecedent(
  tokens: readonly Token[],
  antecedent: TargetAnswer,
): ReferenceAntecedent {
  const spans: TokenSpan[] = [];
  const texts: string[] = [];
  for (const target of [antecedent.answer, ...antecedent.alternates]) {
    if (target.kind === "span") {
      const result = resolveAnchor(tokens, target.anchor);
      if (result.status === "resolved") spans.push(result.span);
    } else {
      texts.push(target.text);
    }
  }
  return { spans, texts };
}

/** How a learner's span answer measured up: same tokens, some shared, or none. */
export type SpanOutcome = "exact" | "overlap" | "miss";

/** Grade a span answer against the reference spans. Exact beats overlap beats miss. */
export function gradeSpanResponse(learner: TokenSpan, reference: ReferenceAntecedent): SpanOutcome {
  if (reference.spans.some((span) => sameSpan(span, learner))) return "exact";
  if (reference.spans.some((span) => spansOverlap(span, learner))) return "overlap";
  return "miss";
}

/** The learner's verdict on their own typed answer, shown beside the reference. */
export type SelfGrade = "match" | "partial" | "miss";

/**
 * One pronoun's outcome. Span answers land on an auto {@link SpanOutcome}; typed
 * answers take the learner's {@link SelfGrade}, or `ungraded` until they judge it;
 * a pronoun with no answer at all is `unanswered`.
 */
export type PronounOutcome = SpanOutcome | SelfGrade | "unanswered" | "ungraded";

/** Whether an outcome counts toward the resolved score. */
export function outcomeIsCorrect(outcome: PronounOutcome): boolean {
  return outcome === "exact" || outcome === "overlap" || outcome === "match";
}

/**
 * Whether an outcome belongs on the miss list the Activity 9 gate makes the
 * learner clear or dismiss. A span with no overlap and a pronoun left entirely
 * unresolved are misses; a self-graded `partial` is partial credit, not a miss,
 * and an `ungraded` typed answer is still awaiting the learner's own verdict.
 */
export function outcomeIsMiss(outcome: PronounOutcome): boolean {
  return outcome === "miss" || outcome === "unanswered";
}

/** Grade one pronoun from its response and the learner's self-grade, if any. */
export function pronounOutcome(
  response: PronounResponse | undefined,
  reference: ReferenceAntecedent,
  selfGrade: SelfGrade | undefined,
): PronounOutcome {
  if (!response) return "unanswered";
  if (response.kind === "span") return gradeSpanResponse(response.span, reference);
  return selfGrade ?? "ungraded";
}

/** One pronoun's graded result. */
export interface PronounResult {
  readonly outcome: PronounOutcome;
  /** Counts toward the resolved score. */
  readonly correct: boolean;
  /** Belongs on the miss list. */
  readonly miss: boolean;
}

/** The whole activity's grade: the resolved count of the total, and per-pronoun results. */
export interface PronounGrade {
  readonly total: number;
  readonly correct: number;
  readonly results: readonly PronounResult[];
}

/**
 * Grade every pronoun from the references, the learner's answers, and their
 * self-grades (keyed by pronoun index). Span answers auto-grade; typed answers
 * take their self-grade, defaulting to `ungraded`.
 */
export function gradePronouns(
  references: readonly ReferenceAntecedent[],
  answer: PronounAnswer,
  selfGrades: Readonly<Record<number, SelfGrade>>,
): PronounGrade {
  const results = references.map((reference, i): PronounResult => {
    const outcome = pronounOutcome(responseFor(answer, i), reference, selfGrades[i]);
    return { outcome, correct: outcomeIsCorrect(outcome), miss: outcomeIsMiss(outcome) };
  });
  return {
    total: references.length,
    correct: results.filter((r) => r.correct).length,
    results,
  };
}
