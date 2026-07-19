/**
 * The session data model.
 *
 * This module defines the serialisable shape of a study session: the Activity 1
 * annotation layer, each activity's answers, commit status, misses, and score,
 * the attempt in progress, and the archive of finished attempts. Everything here
 * is a Zod schema plus its inferred type, for two reasons—the same schema
 * validates progress read back from localStorage (see `./serialise`), and the
 * store (`./store`) builds on the inferred types. Nothing in this module touches
 * React, the DOM, or storage; it is pure data shape.
 *
 * The nine activity keys match the pack's {@link ActiveActivities} flags exactly,
 * so cross-activity state lines up one-to-one with the pack's reference sections.
 */

import { z } from "zod";
import { nonEmptyString, singleLineString, slug } from "../pack/common";
import type { ActiveActivities } from "../pack/metadata";

/**
 * The nine activities, in canonical order, keyed the same way the pack's
 * {@link ActiveActivities} flags are (`readSilently` for Activity 1, `scansion`
 * for Activity 2, and so on). `satisfies` proves every entry names a real flag;
 * a test proves the list stays complete as the pack schema grows.
 */
export const ACTIVITY_KEYS = [
  "readSilently",
  "scansion",
  "pronouns",
  "sentences",
  "glossary",
  "devices",
  "broadDevices",
  "allusions",
  "argument",
] as const satisfies readonly (keyof ActiveActivities)[];

/** One of the nine activity keys. */
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

/**
 * $Claude Vision.md's Activity 9 gate lists unresolved Activity 1 marks plus
 * "misses from Activities 3–4"—that is, `pronouns` and `sentences`. Activities 5,
 * 6, and 8 also record misses, but those belong to the final session summary, not
 * the gate; `selectGateItems` (in `./store`) filters to these two sources so the
 * gate matches Vision.md exactly.
 */
export const GATE_MISS_SOURCES = [
  "pronouns",
  "sentences",
] as const satisfies readonly ActivityKey[];

// ---------------------------------------------------------------------------
// Annotation layer: Activity 1 marks
// ---------------------------------------------------------------------------

// $Claude Vision.md leaves open where the annotation layer's visibility toggles
// live (Activity 1: marks "persist as a layer visible (toggleable) in all later
// activities"). They are deliberately absent from this model: whether a layer is
// currently shown is transient view state, not study progress, so it belongs to
// the renderer's ephemeral React state (Task 8), not the persisted session. What
// persists is the marks themselves and their lifecycle status.

/** The three marks Activity 1's marker menu offers over a selected span. */
export const MarkKind = z.enum(["stumbled", "lost-thread", "odd-word"]);
export type MarkKind = z.infer<typeof MarkKind>;

/**
 * A mark's lifecycle. Open until a later activity resolves what tripped the
 * learner, or they consciously dismiss it at the Activity 9 gate.
 */
export const MarkStatus = z.enum(["open", "resolved", "dismissed"]);
export type MarkStatus = z.infer<typeof MarkStatus>;

/**
 * A half-open token span `[start, end)`, mirroring {@link TokenSpan} in `../grade`
 * but as a Zod schema so persisted marks validate on load. The refinement rejects
 * an empty or inverted span, which no real selection produces.
 */
export const TokenSpanSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((s) => s.end > s.start, { message: "a span's end must be greater than its start" });
export type TokenSpanSchema = z.infer<typeof TokenSpanSchema>;

/**
 * One Activity 1 annotation: a span of the poem, the kind of trouble it marks,
 * and its lifecycle status. The `id` is supplied by the caller (the Activity 1
 * UI) so a mark can be addressed for resolve/dismiss.
 */
export const Mark = z.object({
  id: nonEmptyString,
  kind: MarkKind,
  span: TokenSpanSchema,
  status: MarkStatus.default("open"),
});
export type Mark = z.infer<typeof Mark>;

// ---------------------------------------------------------------------------
// Miss lists
// ---------------------------------------------------------------------------

/**
 * A miss's lifecycle. Open until the learner clears it (resolved at the gate) or
 * dismisses it (consciously set aside).
 */
export const MissStatus = z.enum(["open", "cleared", "dismissed"]);
export type MissStatus = z.infer<typeof MissStatus>;

/**
 * A recorded miss: enough identity to render it in the Activity 9 gate. `source`
 * names the activity that recorded it (denormalised so the gate and summary can
 * label it without walking the tree), `id` is stable within that activity, and
 * `description` is the one line the gate shows.
 */
export const Miss = z.object({
  id: nonEmptyString,
  source: z.enum(ACTIVITY_KEYS),
  description: singleLineString,
  status: MissStatus.default("open"),
});
export type Miss = z.infer<typeof Miss>;

// ---------------------------------------------------------------------------
// Per-activity state
// ---------------------------------------------------------------------------

/**
 * $Claude A precise-but-minimal score: how many gradable items the activity
 * presented and how many the learner got right. Different activities grade
 * differently (percent agreement for scansion, found/missed/false-positive for
 * devices, self-graded match/partial/miss elsewhere), but the session-summary
 * screen (Activity 9) only needs a comparable "correct of total" per activity.
 * Richer per-activity breakdowns stay with each activity's grader in Stage 3
 * rather than being invented here.
 */
export const ScoreSummary = z.object({
  /** How many gradable items the activity presented. */
  total: z.number().int().nonnegative(),
  /** How many the learner got right. */
  correct: z.number().int().nonnegative(),
});
export type ScoreSummary = z.infer<typeof ScoreSummary>;

/**
 * One activity's cross-activity state.
 *
 * $Claude `answers` is deliberately untyped (`unknown`). Each activity's answer
 * shape is defined when its UI lands in Stage 3, and inventing detailed
 * per-activity schemas now would couple this store to guesses that later tasks
 * would only have to unpick. Everything the cross-activity machinery depends
 * on—`committed`, `misses`, and `score`—is typed precisely.
 */
export const ActivityState = z.object({
  /** The learner's raw answer payload; refined per activity in Stage 3. */
  answers: z.unknown().optional(),
  /** True once the activity is committed; commit freezes {@link answers}. */
  committed: z.boolean().default(false),
  /** Misses this activity recorded, feeding the gate and the summary. */
  misses: z.array(Miss).default([]),
  /** The activity's score once graded; absent until then. */
  score: ScoreSummary.optional(),
});
export type ActivityState = z.infer<typeof ActivityState>;

const defaultedActivityState = () => ActivityState.default(() => ActivityState.parse({}));

/**
 * Every activity's state, one entry per {@link ACTIVITY_KEYS} key. Spelled out
 * rather than built programmatically so the inferred type stays exact—each field
 * is precisely an {@link ActivityState}. A test guards that these keys stay in
 * step with {@link ACTIVITY_KEYS}.
 */
export const ActivityStates = z.object({
  readSilently: defaultedActivityState(),
  scansion: defaultedActivityState(),
  pronouns: defaultedActivityState(),
  sentences: defaultedActivityState(),
  glossary: defaultedActivityState(),
  devices: defaultedActivityState(),
  broadDevices: defaultedActivityState(),
  allusions: defaultedActivityState(),
  argument: defaultedActivityState(),
});
export type ActivityStates = z.infer<typeof ActivityStates>;

// ---------------------------------------------------------------------------
// Attempts and the session
// ---------------------------------------------------------------------------

/**
 * An attempt: the unit of study. Commits within it are irreversible (enforced by
 * the store, not the schema); finishing it archives it and starts a fresh one for
 * the same pack.
 */
export const Attempt = z.object({
  /** 1-based attempt number within this session; increments on each finish. */
  index: z.number().int().positive(),
  /** When the attempt began (epoch milliseconds). */
  startedAt: z.number().int().nonnegative(),
  /** Activity 1's annotation layer for this attempt. */
  marks: z.array(Mark).default([]),
  /** Per-activity state. */
  activities: ActivityStates.default(() => ActivityStates.parse({})),
});
export type Attempt = z.infer<typeof Attempt>;

/**
 * A finished attempt.
 *
 * $Claude Vision.md says a finished attempt "archives (scores and surviving miss
 * list retained)". This keeps the whole finished {@link Attempt}, adding only
 * {@link finishedAt}, rather than storing a pruned projection: it is strictly more
 * information for the session-summary screen, the scores and surviving misses read
 * straight off the archived activities and marks, and nothing is lost when the
 * poem is restudied.
 */
export const ArchivedAttempt = Attempt.extend({
  /** When `finishAttempt` archived this attempt (epoch milliseconds). */
  finishedAt: z.number().int().nonnegative(),
});
export type ArchivedAttempt = z.infer<typeof ArchivedAttempt>;

/** One pack's whole session: the current attempt plus every finished one. */
export const SessionData = z.object({
  /** The pack this session studies; matches the pack's `id`. */
  packId: slug,
  /**
   * The content hash of the raw pack-file text (see `./hash`). Part of the
   * storage key: a changed hash means the pack was edited, and Task 7 offers
   * keep-progress or start-fresh.
   */
  contentHash: nonEmptyString,
  /** The attempt in progress. */
  currentAttempt: Attempt,
  /** Finished attempts, oldest first. */
  archivedAttempts: z.array(ArchivedAttempt).default([]),
});
export type SessionData = z.infer<typeof SessionData>;

// ---------------------------------------------------------------------------
// Fresh-state builders
// ---------------------------------------------------------------------------

/** A fresh attempt: no marks, every activity at its default state. */
export function freshAttempt(index: number, startedAt: number): Attempt {
  return {
    index,
    startedAt,
    marks: [],
    activities: ActivityStates.parse({}),
  };
}

/** A fresh session for a pack: attempt 1, nothing archived. */
export function freshSession(packId: string, contentHash: string, now: number): SessionData {
  return {
    packId,
    contentHash,
    currentAttempt: freshAttempt(1, now),
    archivedAttempts: [],
  };
}
