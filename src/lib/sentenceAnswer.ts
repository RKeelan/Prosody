/**
 * Activity 4's answer payload: how the learner named each sentence's parts, with
 * the pure builders and editors the UI drives them through.
 *
 * A sentence has four gradable parts—subject, verb, object-or-complement, and a
 * one-line paraphrase. Subject and verb are each a {@link PartResponse}: a span
 * tapped in the poem, or typed text for an implied part ("(implied) the
 * speaker"). The object slot adds "no object" as a first-class answer, for the
 * intransitives and copulars where naming an object would be wrong, so it is a
 * wider {@link ObjectAnswer}. The paraphrase is plain text.
 *
 * This mirrors {@link PronounAnswer}: the store holds the payload opaquely
 * (`ActivityState.answers` is `unknown`), this module owns the shape and every
 * transition, editors return a fresh answer rather than mutating, and
 * {@link coerceSentenceAnswer} rebuilds it defensively from whatever storage
 * returns. Where the two activities overlap—a span-or-text learner response—the
 * shapes match on purpose, but each activity keeps its own so neither couples to
 * the other's index scheme (pronouns key by pronoun; sentences by sentence and
 * slot).
 */

import type { TokenSpan } from "./grade";

/** The two parts answered only by span or typed text. */
export type PartSlot = "subject" | "verb";

/** One part's answer: a span tapped in the poem, or typed text for an implied part. */
export type PartResponse =
  | { readonly kind: "span"; readonly span: TokenSpan }
  | { readonly kind: "text"; readonly text: string };

/**
 * The object-or-complement answer. Either "no object" (first-class, for
 * intransitives and copulars) or a {@link PartResponse}, flattened into one union
 * so the object slot is a single value the UI toggles between.
 */
export type ObjectAnswer =
  | { readonly kind: "none" }
  | { readonly kind: "span"; readonly span: TokenSpan }
  | { readonly kind: "text"; readonly text: string };

/** One sentence's answer. A part absent here is still unanswered. */
export interface SentenceResponse {
  readonly subject?: PartResponse;
  readonly verb?: PartResponse;
  readonly object?: ObjectAnswer;
  /** The one-line "who does what to whom" paraphrase, trimmed and non-empty. */
  readonly paraphrase?: string;
}

export interface SentenceAnswer {
  /** Responses keyed by the sentence's index in the pack's sentence list. */
  readonly sentences: Readonly<Record<number, SentenceResponse>>;
}

/** A blank answer: no sentence touched yet. */
export function emptySentenceAnswer(): SentenceAnswer {
  return { sentences: {} };
}

/** One sentence's response, or an empty response when it is untouched. */
export function responseFor(answer: SentenceAnswer, index: number): SentenceResponse {
  return answer.sentences[index] ?? {};
}

/**
 * Rewrite one sentence's response through `update`, pruning the entry when the
 * result is empty so an answer that has been cleared back to blank leaves no
 * trace (and {@link answeredSentenceCount} stays honest).
 */
function updateSentence(
  answer: SentenceAnswer,
  index: number,
  update: (response: SentenceResponse) => SentenceResponse,
): SentenceAnswer {
  const next = update(responseFor(answer, index));
  const sentences = { ...answer.sentences };
  if (isEmptyResponse(next)) delete sentences[index];
  else sentences[index] = next;
  return { sentences };
}

/** True when a response names none of the four parts. */
function isEmptyResponse(response: SentenceResponse): boolean {
  return (
    response.subject === undefined &&
    response.verb === undefined &&
    response.object === undefined &&
    response.paraphrase === undefined
  );
}

/** Record a span answer for the subject or verb slot, replacing any existing one. */
export function setPartSpan(
  answer: SentenceAnswer,
  index: number,
  slot: PartSlot,
  span: TokenSpan,
): SentenceAnswer {
  return updateSentence(answer, index, (r) => ({ ...r, [slot]: { kind: "span", span } }));
}

/**
 * Record a typed answer for the subject or verb slot, replacing any existing
 * one. Empty or whitespace-only text clears the slot instead.
 */
export function setPartText(
  answer: SentenceAnswer,
  index: number,
  slot: PartSlot,
  text: string,
): SentenceAnswer {
  const trimmed = text.trim();
  if (trimmed.length === 0) return clearPart(answer, index, slot);
  return updateSentence(answer, index, (r) => ({ ...r, [slot]: { kind: "text", text: trimmed } }));
}

/** Drop the subject or verb slot's answer, leaving it unanswered. */
export function clearPart(answer: SentenceAnswer, index: number, slot: PartSlot): SentenceAnswer {
  return updateSentence(answer, index, ({ [slot]: _dropped, ...rest }) => rest);
}

/** Record a span answer for the object slot. */
export function setObjectSpan(
  answer: SentenceAnswer,
  index: number,
  span: TokenSpan,
): SentenceAnswer {
  return updateSentence(answer, index, (r) => ({ ...r, object: { kind: "span", span } }));
}

/** Record a typed answer for the object slot; empty text clears it. */
export function setObjectText(answer: SentenceAnswer, index: number, text: string): SentenceAnswer {
  const trimmed = text.trim();
  if (trimmed.length === 0) return clearObject(answer, index);
  return updateSentence(answer, index, (r) => ({ ...r, object: { kind: "text", text: trimmed } }));
}

/** Answer the object slot as "no object"—a deliberate answer, not a blank. */
export function setObjectNone(answer: SentenceAnswer, index: number): SentenceAnswer {
  return updateSentence(answer, index, (r) => ({ ...r, object: { kind: "none" } }));
}

/** Drop the object slot's answer, leaving it unanswered. */
export function clearObject(answer: SentenceAnswer, index: number): SentenceAnswer {
  return updateSentence(answer, index, ({ object: _dropped, ...rest }) => rest);
}

/** Record the paraphrase; empty or whitespace-only text clears it. */
export function setParaphrase(answer: SentenceAnswer, index: number, text: string): SentenceAnswer {
  const trimmed = text.trim();
  return updateSentence(answer, index, ({ paraphrase: _dropped, ...rest }) =>
    trimmed.length === 0 ? rest : { ...rest, paraphrase: trimmed },
  );
}

/** How many of a sentence's four parts have been answered. */
export function answeredParts(response: SentenceResponse): number {
  let count = 0;
  if (response.subject !== undefined) count++;
  if (response.verb !== undefined) count++;
  if (response.object !== undefined) count++;
  if (response.paraphrase !== undefined) count++;
  return count;
}

/** True when all four of a sentence's parts have an answer. */
export function isSentenceAnswered(response: SentenceResponse): boolean {
  return answeredParts(response) === 4;
}

/** How many sentences have all four parts answered. */
export function answeredSentenceCount(answer: SentenceAnswer): number {
  return Object.values(answer.sentences).filter(isSentenceAnswered).length;
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

/** A subject/verb response read from unknown data, or null when malformed. */
function coercePart(value: unknown): PartResponse | null {
  const entry = value as { kind?: unknown } | null | undefined;
  if (!entry || typeof entry !== "object") return null;
  if (entry.kind === "span") {
    const span = coerceSpan((entry as { span?: unknown }).span);
    return span ? { kind: "span", span } : null;
  }
  if (entry.kind === "text") {
    const text = (entry as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return { kind: "text", text: text.trim() };
    }
  }
  return null;
}

/** An object response read from unknown data, or null when malformed. */
function coerceObject(value: unknown): ObjectAnswer | null {
  const entry = value as { kind?: unknown } | null | undefined;
  if (!entry || typeof entry !== "object") return null;
  if (entry.kind === "none") return { kind: "none" };
  return coercePart(value);
}

/**
 * Rebuild an answer from `raw`, keeping only responses well-formed for the
 * current poem: an entry whose index is a real sentence (0 ≤ i < count), with a
 * valid span, non-empty text, or "no object" per part. This is the only entry
 * point that trusts `raw`, so every value it keeps is re-checked.
 */
export function coerceSentenceAnswer(raw: unknown, sentenceCount: number): SentenceAnswer {
  const source = (raw ?? {}) as { sentences?: unknown };
  const rawSentences =
    source.sentences && typeof source.sentences === "object"
      ? (source.sentences as Record<string, unknown>)
      : {};

  const sentences: Record<number, SentenceResponse> = {};
  for (let i = 0; i < sentenceCount; i++) {
    const entry = rawSentences[i] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== "object") continue;
    const response: {
      subject?: PartResponse;
      verb?: PartResponse;
      object?: ObjectAnswer;
      paraphrase?: string;
    } = {};
    const subject = coercePart(entry.subject);
    if (subject) response.subject = subject;
    const verb = coercePart(entry.verb);
    if (verb) response.verb = verb;
    const object = coerceObject(entry.object);
    if (object) response.object = object;
    if (typeof entry.paraphrase === "string" && entry.paraphrase.trim().length > 0) {
      response.paraphrase = entry.paraphrase.trim();
    }
    if (!isEmptyResponse(response)) sentences[i] = response;
  }
  return { sentences };
}
