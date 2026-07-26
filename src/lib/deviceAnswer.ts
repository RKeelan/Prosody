/**
 * Activity 6's answer payload: the device instances the learner tagged, with the
 * pure builders and editors the UI drives them through.
 *
 * Unlike Activities 3, 4, and 5—each a fixed reference list the learner answers
 * slot by slot—this is a hunt: the learner produces their own variable-length
 * list of tags, each a span they highlighted, the palette device they named it,
 * and one line on the work the device does. A tag therefore carries a stable
 * `id`, minted when it is made, so a later note edit or an un-tag can address it;
 * grading (`@/lib/deviceGrade`) matches these tags against the pack's reference
 * instances to score found / missed / false positive.
 *
 * The store holds this as opaque data (`ActivityState.answers` is `unknown`);
 * this module owns the shape and every transition, and {@link coerceDeviceAnswer}
 * rebuilds it defensively from whatever storage returns. Editors return a fresh
 * answer and never mutate, matching the store's write-through model.
 */

import type { TokenSpan } from "./grade";

/** One device the learner tagged: where it sits, which palette device it realises, and the note. */
export interface DeviceTag {
  /** Stable id, minted when the tag is made, so a note edit or an un-tag can address it. */
  readonly id: string;
  /** The palette entry id the learner named this span with. */
  readonly deviceId: string;
  /** The tagged span, as a half-open `[start, end)` token range. */
  readonly span: TokenSpan;
  /** The learner's one line on the work the device does; empty until they write it. */
  readonly note: string;
}

export interface DeviceAnswer {
  /** The learner's tags, in the order they were made. */
  readonly tags: readonly DeviceTag[];
}

/** A blank answer: nothing tagged yet. */
export function emptyDeviceAnswer(): DeviceAnswer {
  return { tags: [] };
}

/** Add a tag. The caller mints the id (`crypto.randomUUID` in the browser). */
export function addTag(answer: DeviceAnswer, tag: DeviceTag): DeviceAnswer {
  return { tags: [...answer.tags, tag] };
}

/** Drop a tag by id, leaving the rest. A no-op when no tag has that id. */
export function removeTag(answer: DeviceAnswer, id: string): DeviceAnswer {
  const tags = answer.tags.filter((t) => t.id !== id);
  return tags.length === answer.tags.length ? answer : { tags };
}

/**
 * Set a tag's function note, keeping its span and device. Stored as written—not
 * trimmed—so a learner can type a trailing space without it vanishing under them;
 * grading and the reveal trim when they read it. A no-op when no tag has that id.
 */
export function setTagNote(answer: DeviceAnswer, id: string, note: string): DeviceAnswer {
  let changed = false;
  const tags = answer.tags.map((t) => {
    if (t.id !== id) return t;
    changed = true;
    return { ...t, note };
  });
  return changed ? { tags } : answer;
}

/** The tag with `id`, or undefined when none has it. */
export function tagById(answer: DeviceAnswer, id: string): DeviceTag | undefined {
  return answer.tags.find((t) => t.id === id);
}

/** How many tags the learner has made. */
export function tagCount(answer: DeviceAnswer): number {
  return answer.tags.length;
}

/** A span read from unknown data, or null when it is not a well-formed span for this poem. */
function coerceSpan(value: unknown, tokenCount: number): TokenSpan | null {
  const span = value as { start?: unknown; end?: unknown } | null | undefined;
  if (!span || typeof span !== "object") return null;
  const { start, end } = span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const s = start as number;
  const e = end as number;
  if (s < 0 || e <= s || e > tokenCount) return null;
  return { start: s, end: e };
}

/**
 * Rebuild an answer from `raw`, keeping only tags well-formed for the current
 * poem: a string `id`, a non-empty string `deviceId`, a valid span (integers,
 * `0 ≤ start < end ≤ tokenCount`), and a string `note` (defaulting to empty). A
 * tag whose stored id is missing or blank is given a positional fallback so it
 * stays addressable. This is the only entry point that trusts `raw`, so every
 * value it keeps is re-checked; the deviceId is not checked against the palette
 * here (a tag naming an unknown device simply grades as a false positive).
 */
export function coerceDeviceAnswer(raw: unknown, tokenCount: number): DeviceAnswer {
  const source = (raw ?? {}) as { tags?: unknown };
  const rawTags = Array.isArray(source.tags) ? source.tags : [];

  const tags: DeviceTag[] = [];
  const seen = new Set<string>();
  rawTags.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as { id?: unknown; deviceId?: unknown; span?: unknown; note?: unknown };
    if (typeof record.deviceId !== "string" || record.deviceId.length === 0) return;
    const span = coerceSpan(record.span, tokenCount);
    if (!span) return;
    let id = typeof record.id === "string" && record.id.length > 0 ? record.id : `restored-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const note = typeof record.note === "string" ? record.note : "";
    tags.push({ id, deviceId: record.deviceId, span, note });
  });
  return { tags };
}
