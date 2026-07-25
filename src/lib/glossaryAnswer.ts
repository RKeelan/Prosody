/**
 * Activity 5's answer payload: the gloss the learner wrote for each word they
 * tapped, with the pure builders and editors the UI drives them through.
 *
 * Every word in the poem is glossable, so a gloss is keyed by the word's token
 * index—not, as in Activities 3 and 4, by a slot in a fixed reference list. A
 * gloss carries a primary sense and, for words the learner reads as carrying two
 * meanings at once, an optional secondary sense: the "state both senses" the
 * odd-usage words want. Both are entered during the hunt, before commit, because
 * commit freezes the answer; the reveal that dotted-underlines the odd-usage
 * words then shows the reference's two senses beside whatever the learner
 * recorded, for them to self-grade.
 *
 * The store holds this as opaque data (`ActivityState.answers` is `unknown`);
 * this module owns the shape and every transition, and {@link coerceGlossaryAnswer}
 * rebuilds it defensively from whatever storage returns. Editors return a fresh
 * answer and never mutate, matching the store's write-through model.
 */

/**
 * One word's gloss. `primary` is the sense the learner would give first and is
 * always present (a gloss with no primary is no gloss); `secondary` is the second
 * sense a word used two ways carries, present only when the learner recorded one.
 */
export interface WordGloss {
  readonly primary: string;
  readonly secondary?: string;
}

export interface GlossaryAnswer {
  /**
   * The learner's glosses, keyed by the glossed word's token index. A word absent
   * here is unglossed; only glossed words are stored.
   */
  readonly glosses: Readonly<Record<number, WordGloss>>;
}

/** A blank answer: nothing glossed yet. */
export function emptyGlossaryAnswer(): GlossaryAnswer {
  return { glosses: {} };
}

/** The gloss for a word, or undefined when it is still unglossed. */
export function glossFor(answer: GlossaryAnswer, index: number): WordGloss | undefined {
  return answer.glosses[index];
}

/** How many words the learner has glossed. */
export function glossedCount(answer: GlossaryAnswer): number {
  return Object.keys(answer.glosses).length;
}

/**
 * Set a word's primary sense, keeping any secondary. Empty or whitespace-only
 * text clears the whole gloss instead—a word with no primary sense is unglossed,
 * and a lone secondary sense would be a gloss with no first meaning.
 */
export function setPrimarySense(
  answer: GlossaryAnswer,
  index: number,
  text: string,
): GlossaryAnswer {
  const trimmed = text.trim();
  if (trimmed.length === 0) return clearGloss(answer, index);
  const existing = answer.glosses[index];
  const gloss: WordGloss =
    existing?.secondary !== undefined
      ? { primary: trimmed, secondary: existing.secondary }
      : { primary: trimmed };
  return { glosses: { ...answer.glosses, [index]: gloss } };
}

/**
 * Set a word's secondary sense. A no-op when the word has no primary sense yet:
 * a second meaning only makes sense once a first is recorded. Empty or
 * whitespace-only text drops the secondary sense, leaving the primary alone.
 */
export function setSecondarySense(
  answer: GlossaryAnswer,
  index: number,
  text: string,
): GlossaryAnswer {
  const existing = answer.glosses[index];
  if (!existing) return answer;
  const trimmed = text.trim();
  const gloss: WordGloss =
    trimmed.length === 0
      ? { primary: existing.primary }
      : { primary: existing.primary, secondary: trimmed };
  return { glosses: { ...answer.glosses, [index]: gloss } };
}

/** Drop a word's gloss, leaving it unglossed. A no-op when it has none. */
export function clearGloss(answer: GlossaryAnswer, index: number): GlossaryAnswer {
  if (!(index in answer.glosses)) return answer;
  const glosses = { ...answer.glosses };
  delete glosses[index];
  return { glosses };
}

/** A non-empty trimmed string read from unknown data, or null. */
function coerceText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Rebuild an answer from `raw`, keeping only glosses that are well-formed for the
 * current poem: an entry whose key is a real token index (0 ≤ i < tokenCount)
 * with a non-empty primary sense; a secondary sense is kept only when non-empty.
 * This is the only entry point that trusts `raw`, so every value it keeps is
 * re-checked.
 */
export function coerceGlossaryAnswer(raw: unknown, tokenCount: number): GlossaryAnswer {
  const source = (raw ?? {}) as { glosses?: unknown };
  const rawGlosses =
    source.glosses && typeof source.glosses === "object"
      ? (source.glosses as Record<string, unknown>)
      : {};

  const glosses: Record<number, WordGloss> = {};
  for (const [key, value] of Object.entries(rawGlosses)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= tokenCount) continue;
    if (!value || typeof value !== "object") continue;
    const primary = coerceText((value as { primary?: unknown }).primary);
    if (primary === null) continue;
    const secondary = coerceText((value as { secondary?: unknown }).secondary);
    glosses[index] = secondary === null ? { primary } : { primary, secondary };
  }
  return { glosses };
}
