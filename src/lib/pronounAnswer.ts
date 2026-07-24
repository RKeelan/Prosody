/**
 * Activity 3's answer payload: how the learner resolved each target pronoun,
 * with the pure builders and editors the UI drives them through.
 *
 * A pronoun is resolved one of two ways—by a span (tokens tapped in the poem,
 * the antecedent lying right there in the text) or by typed text (an implied or
 * extratextual antecedent, "the speaker", "(implied) the statue"). That mirrors
 * the pack's {@link AnswerTarget} discriminated union, except a learner's span is
 * already a resolved {@link TokenSpan}—tapped, not anchored. The store holds this
 * as opaque data (`ActivityState.answers` is `unknown`); this module owns the
 * shape and every transition, and {@link coercePronounAnswer} rebuilds it
 * defensively from whatever storage returns. Editors return a fresh answer and
 * never mutate, matching the store's write-through model.
 */

import type { TokenSpan } from "./grade";

/** One pronoun's antecedent as the learner gave it: a poem span, or typed text. */
export type PronounResponse =
  | { readonly kind: "span"; readonly span: TokenSpan }
  | { readonly kind: "text"; readonly text: string };

export interface PronounAnswer {
  /**
   * The learner's responses, keyed by the pronoun's index in the pack's pronoun
   * list. A pronoun absent here is unresolved; only answered pronouns are stored.
   */
  readonly responses: Readonly<Record<number, PronounResponse>>;
}

/** A blank answer: no pronoun resolved yet. */
export function emptyPronounAnswer(): PronounAnswer {
  return { responses: {} };
}

/** The learner's response for a pronoun, or undefined when it is still unresolved. */
export function responseFor(answer: PronounAnswer, index: number): PronounResponse | undefined {
  return answer.responses[index];
}

/** Record a span answer for a pronoun, replacing any existing response. */
export function withSpanResponse(
  answer: PronounAnswer,
  index: number,
  span: TokenSpan,
): PronounAnswer {
  return { responses: { ...answer.responses, [index]: { kind: "span", span } } };
}

/**
 * Record a typed answer for a pronoun, replacing any existing response. Empty or
 * whitespace-only text clears the response instead—an implied antecedent still
 * has to say something.
 */
export function withTextResponse(
  answer: PronounAnswer,
  index: number,
  text: string,
): PronounAnswer {
  const trimmed = text.trim();
  if (trimmed.length === 0) return clearResponse(answer, index);
  return { responses: { ...answer.responses, [index]: { kind: "text", text: trimmed } } };
}

/** Drop a pronoun's response, leaving it unresolved. A no-op when it has none. */
export function clearResponse(answer: PronounAnswer, index: number): PronounAnswer {
  if (!(index in answer.responses)) return answer;
  const responses = { ...answer.responses };
  delete responses[index];
  return { responses };
}

/** How many pronouns the learner has resolved. */
export function answeredCount(answer: PronounAnswer): number {
  return Object.keys(answer.responses).length;
}

/** A span read from unknown data, or null when it is not a well-formed, non-empty span. */
function coerceSpan(value: unknown): TokenSpan | null {
  const span = value as { start?: unknown; end?: unknown } | null | undefined;
  if (!span || typeof span !== "object") return null;
  const { start, end } = span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if ((start as number) < 0 || (end as number) <= (start as number)) return null;
  return { start: start as number, end: end as number };
}

/**
 * Rebuild an answer from `raw`, keeping only responses that are well-formed for
 * the current poem: an entry whose index is a real pronoun (0 ≤ i < count), of a
 * known kind, with a valid span or non-empty text. This is the only entry point
 * that trusts `raw`, so every value it keeps is re-checked.
 */
export function coercePronounAnswer(raw: unknown, pronounCount: number): PronounAnswer {
  const source = (raw ?? {}) as { responses?: unknown };
  const rawResponses =
    source.responses && typeof source.responses === "object"
      ? (source.responses as Record<string, unknown>)
      : {};

  const responses: Record<number, PronounResponse> = {};
  for (let i = 0; i < pronounCount; i++) {
    const entry = rawResponses[i] as { kind?: unknown } | undefined;
    if (!entry || typeof entry !== "object") continue;
    if (entry.kind === "span") {
      const span = coerceSpan((entry as { span?: unknown }).span);
      if (span) responses[i] = { kind: "span", span };
    } else if (entry.kind === "text") {
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        responses[i] = { kind: "text", text: text.trim() };
      }
    }
  }
  return { responses };
}
