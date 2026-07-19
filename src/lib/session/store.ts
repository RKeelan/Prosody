/**
 * The session store.
 *
 * A Zustand vanilla store holding one pack's cross-activity state: the Activity 1
 * annotation layer, each activity's answers, commit status, misses, and score, and
 * the archive of finished attempts. It is built with `createStore` from
 * `zustand/vanilla` through {@link createSessionStore}, so `bun test` drives it
 * with no DOM; Task 7 adds the React `useStore` binding on top.
 *
 * Two invariants shape the actions:
 *
 *   - Commit is irreversible within an attempt. Once an activity is committed,
 *     {@link SessionActions.recordAnswers} is a no-op. $Claude It is silently
 *     ignored rather than throwing: the UI disables editing after commit, so a
 *     stray write is a programming slip, not a user action, and a quiet no-op
 *     keeps every caller free of guard code. Committing again likewise never
 *     overwrites the recorded score. Marks, misses, and scores stay mutable after
 *     commit, because the self-graded activities score after the reference is
 *     revealed and the Activity 9 gate resolves marks and misses once every
 *     activity is done.
 *   - Persistence is write-through. When a store is created with a storage, every
 *     state change is serialised straight back to it; no action writes storage
 *     itself.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { sameSpan, type TokenSpan } from "../grade";
import {
  type ActivityKey,
  type ActivityState,
  type ArchivedAttempt,
  freshAttempt,
  GATE_MISS_SOURCES,
  type Mark,
  type MarkKind,
  type MarkStatus,
  type Miss,
  type MissStatus,
  type ScoreSummary,
  type SessionData,
} from "./model";
import { saveSession } from "./persistence";
import type { SessionStorage } from "./storage";

// ---------------------------------------------------------------------------
// Pure session transforms
// ---------------------------------------------------------------------------

/**
 * Replace one activity's state, immutably. Returns the same session reference
 * when `update` leaves the activity untouched, so a no-op action never triggers a
 * needless write-through.
 */
function updateActivity(
  session: SessionData,
  activity: ActivityKey,
  update: (state: ActivityState) => ActivityState,
): SessionData {
  const current = session.currentAttempt.activities[activity];
  const next = update(current);
  if (next === current) return session;
  return {
    ...session,
    currentAttempt: {
      ...session.currentAttempt,
      activities: { ...session.currentAttempt.activities, [activity]: next },
    },
  };
}

/** Replace the current attempt's marks, immutably. */
function replaceMarks(session: SessionData, marks: Mark[]): SessionData {
  return { ...session, currentAttempt: { ...session.currentAttempt, marks } };
}

/** Set one mark's status, leaving the rest untouched. */
function setMarkStatus(session: SessionData, id: string, status: MarkStatus): SessionData {
  return replaceMarks(
    session,
    session.currentAttempt.marks.map((m) => (m.id === id ? { ...m, status } : m)),
  );
}

/** Set one miss's status within an activity, leaving the rest untouched. */
function setMissStatus(
  session: SessionData,
  activity: ActivityKey,
  id: string,
  status: MissStatus,
): SessionData {
  return updateActivity(session, activity, (a) => ({
    ...a,
    misses: a.misses.map((m) => (m.id === id ? { ...m, status } : m)),
  }));
}

// ---------------------------------------------------------------------------
// The Activity 9 gate selector
// ---------------------------------------------------------------------------

/** A single item the Activity 9 gate must have the learner clear or dismiss. */
export type GateItem =
  | { readonly kind: "mark"; readonly mark: Mark }
  | { readonly kind: "miss"; readonly miss: Miss };

/**
 * The Activity 9 gate list: every still-open Activity 1 mark, followed by every
 * open miss from Activities 3–4 ({@link GATE_MISS_SOURCES}). Marks come first, in
 * mark order; misses follow, grouped by source activity. Derived purely from the
 * session, so the gate screen and its tests share one definition.
 */
export function selectGateItems(session: SessionData): GateItem[] {
  const items: GateItem[] = [];
  for (const mark of session.currentAttempt.marks) {
    if (mark.status === "open") items.push({ kind: "mark", mark });
  }
  for (const source of GATE_MISS_SOURCES) {
    for (const miss of session.currentAttempt.activities[source].misses) {
      if (miss.status === "open") items.push({ kind: "miss", miss });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** The store's actions. See the module doc comment for the commit invariant. */
export interface SessionActions {
  /** Record a learner's answer payload for an activity. A no-op once committed. */
  recordAnswers(activity: ActivityKey, answers: unknown): void;
  /** Commit an activity, freezing its answers and optionally recording a score. Idempotent. */
  commitActivity(activity: ActivityKey, score?: ScoreSummary): void;
  /** Set or update an activity's score, allowed before or after commit (self-grading). */
  setScore(activity: ActivityKey, score: ScoreSummary): void;
  /**
   * Add an Activity 1 mark. Ignored when the id is already taken, or when a
   * live mark of the same kind already covers exactly the same span—marking
   * one span twice is a slip, and two identical marks are indistinguishable on
   * the poem while inflating the gate's list.
   */
  addMark(mark: { id: string; kind: MarkKind; span: TokenSpan }): void;
  /**
   * Delete an Activity 1 mark outright, as when the learner un-marks a span
   * they marked by mistake. Distinct from {@link dismissMark}: dismissing is a
   * decision the gate records, removing is an undo that leaves no trace.
   */
  removeMark(id: string): void;
  /** Resolve an Activity 1 mark. */
  resolveMark(id: string): void;
  /** Dismiss an Activity 1 mark (consciously set aside at the gate). */
  dismissMark(id: string): void;
  /** Record a miss under an activity. A duplicate id within that activity is ignored. */
  recordMiss(activity: ActivityKey, miss: { id: string; description: string }): void;
  /** Clear a miss (resolved at the gate). */
  clearMiss(activity: ActivityKey, id: string): void;
  /** Dismiss a miss (consciously set aside at the gate). */
  dismissMiss(activity: ActivityKey, id: string): void;
  /** Archive the current attempt and begin a fresh one for the same pack. */
  finishAttempt(): void;
}

/** The store's shape: the session document and the actions over it. */
export interface SessionStoreState {
  readonly session: SessionData;
  readonly actions: SessionActions;
}

export interface SessionStoreConfig {
  /** The session to start from: a fresh session, or one loaded from storage. */
  initial: SessionData;
  /** Where to write progress through on each change; omit for a non-persistent store. */
  storage?: SessionStorage;
  /** Clock for archival timestamps; defaults to `Date.now`, injected for tests. */
  now?: () => number;
}

/**
 * Build a session store. When `storage` is given, the store subscribes itself to
 * write every change back through {@link saveSession}; that write is best-effort,
 * so a full or unavailable store degrades to lost persistence rather than a broken
 * session.
 */
export function createSessionStore(config: SessionStoreConfig): StoreApi<SessionStoreState> {
  const now = config.now ?? Date.now;

  const store = createStore<SessionStoreState>((set) => {
    /**
     * Apply a pure transform to the session. A transform that returns the same
     * reference leaves the store—and its subscribers—untouched.
     */
    const apply = (mutate: (session: SessionData) => SessionData) =>
      set((state) => {
        const next = mutate(state.session);
        return next === state.session ? state : { session: next };
      });

    const actions: SessionActions = {
      recordAnswers: (activity, answers) =>
        apply((s) => updateActivity(s, activity, (a) => (a.committed ? a : { ...a, answers }))),

      commitActivity: (activity, score) =>
        apply((s) =>
          updateActivity(s, activity, (a) =>
            a.committed ? a : { ...a, committed: true, score: score ?? a.score },
          ),
        ),

      setScore: (activity, score) =>
        apply((s) => updateActivity(s, activity, (a) => ({ ...a, score }))),

      addMark: (mark) =>
        apply((s) => {
          // A dismissed mark does not block a new one: it is invisible on the
          // poem, so refusing to re-mark that span would look like a dead
          // button. Re-marking it is the learner raising it afresh.
          const duplicate = s.currentAttempt.marks.some(
            (m) =>
              m.id === mark.id ||
              (m.kind === mark.kind && m.status !== "dismissed" && sameSpan(m.span, mark.span)),
          );
          if (duplicate) return s;
          const created: Mark = {
            id: mark.id,
            kind: mark.kind,
            span: mark.span,
            status: "open",
          };
          return replaceMarks(s, [...s.currentAttempt.marks, created]);
        }),

      removeMark: (id) =>
        apply((s) => {
          const remaining = s.currentAttempt.marks.filter((m) => m.id !== id);
          return remaining.length === s.currentAttempt.marks.length
            ? s
            : replaceMarks(s, remaining);
        }),

      resolveMark: (id) => apply((s) => setMarkStatus(s, id, "resolved")),
      dismissMark: (id) => apply((s) => setMarkStatus(s, id, "dismissed")),

      recordMiss: (activity, miss) =>
        apply((s) =>
          updateActivity(s, activity, (a) => {
            if (a.misses.some((m) => m.id === miss.id)) return a;
            const created: Miss = {
              id: miss.id,
              source: activity,
              description: miss.description,
              status: "open",
            };
            return { ...a, misses: [...a.misses, created] };
          }),
        ),

      clearMiss: (activity, id) => apply((s) => setMissStatus(s, activity, id, "cleared")),
      dismissMiss: (activity, id) => apply((s) => setMissStatus(s, activity, id, "dismissed")),

      finishAttempt: () =>
        apply((session) => {
          const finishedAt = now();
          const archived: ArchivedAttempt = { ...session.currentAttempt, finishedAt };
          return {
            ...session,
            currentAttempt: freshAttempt(session.currentAttempt.index + 1, finishedAt),
            archivedAttempts: [...session.archivedAttempts, archived],
          };
        }),
    };

    return { session: config.initial, actions };
  });

  if (config.storage) {
    const storage = config.storage;
    store.subscribe((state) => {
      try {
        saveSession(storage, state.session);
      } catch {
        // $Claude Progress persistence is best-effort: a full or unavailable
        // store must not break the study session. Swallowing is deliberate here
        // and nowhere else—the injected storage is the app's chance to surface it.
      }
    });
  }

  return store;
}
