import { describe, expect, test } from "bun:test";
import { freshSession } from "./model";
import { loadSession } from "./persistence";
import { createMemoryStorage, type SessionStorage } from "./storage";
import { createSessionStore, type SessionStoreState, selectGateItems } from "./store";

/** A store over a fresh session, with an optional storage and a fixed clock. */
function makeStore(options: { storage?: SessionStorage; now?: () => number } = {}) {
  return createSessionStore({
    initial: freshSession("ozymandias", "hash1", 1000),
    storage: options.storage,
    now: options.now,
  });
}

const span = (start: number, end: number) => ({ start, end });

function activity(state: SessionStoreState, key: "pronouns" | "scansion" | "sentences") {
  return state.session.currentAttempt.activities[key];
}

describe("recording and committing answers", () => {
  test("records an answer payload before commit", () => {
    const store = makeStore();
    store.getState().actions.recordAnswers("pronouns", { "0": "the boat" });
    expect(activity(store.getState(), "pronouns").answers).toEqual({ "0": "the boat" });
  });

  test("commit freezes answers: a later recordAnswers is a silent no-op", () => {
    const store = makeStore();
    const { recordAnswers, commitActivity } = store.getState().actions;
    recordAnswers("pronouns", { "0": "first" });
    commitActivity("pronouns");
    recordAnswers("pronouns", { "0": "second" });
    expect(activity(store.getState(), "pronouns").committed).toBe(true);
    expect(activity(store.getState(), "pronouns").answers).toEqual({ "0": "first" });
  });

  test("commit records a score and is idempotent", () => {
    const store = makeStore();
    store.getState().actions.commitActivity("scansion", { total: 8, correct: 7 });
    store.getState().actions.commitActivity("scansion", { total: 8, correct: 0 });
    expect(activity(store.getState(), "scansion").score).toEqual({ total: 8, correct: 7 });
  });

  test("setScore works before and after commit (self-grading)", () => {
    const store = makeStore();
    const { setScore, commitActivity } = store.getState().actions;
    setScore("sentences", { total: 2, correct: 1 });
    expect(activity(store.getState(), "sentences").score).toEqual({ total: 2, correct: 1 });
    commitActivity("sentences");
    setScore("sentences", { total: 2, correct: 2 });
    expect(activity(store.getState(), "sentences").score).toEqual({ total: 2, correct: 2 });
  });
});

describe("Activity 1 marks", () => {
  test("adds marks and ignores a duplicate id", () => {
    const store = makeStore();
    const { addMark } = store.getState().actions;
    addMark({ id: "m1", kind: "stumbled", span: span(0, 2) });
    addMark({ id: "m1", kind: "odd-word", span: span(5, 6) });
    const marks = store.getState().session.currentAttempt.marks;
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({ id: "m1", kind: "stumbled", span: span(0, 2), status: "open" });
  });

  test("resolves and dismisses marks by id", () => {
    const store = makeStore();
    const { addMark, resolveMark, dismissMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(0, 1) });
    addMark({ id: "b", kind: "lost-thread", span: span(2, 4) });
    resolveMark("a");
    dismissMark("b");
    const byId = Object.fromEntries(
      store.getState().session.currentAttempt.marks.map((m) => [m.id, m.status]),
    );
    expect(byId).toEqual({ a: "resolved", b: "dismissed" });
  });

  test("ignores a second mark of the same kind over the same span", () => {
    const store = makeStore();
    const { addMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(3, 6) });
    addMark({ id: "b", kind: "stumbled", span: span(3, 6) });
    const marks = store.getState().session.currentAttempt.marks;
    expect(marks.map((m) => m.id)).toEqual(["a"]);
  });

  test("a different kind over the same span is a distinct mark", () => {
    const store = makeStore();
    const { addMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(3, 6) });
    addMark({ id: "b", kind: "odd-word", span: span(3, 6) });
    expect(store.getState().session.currentAttempt.marks).toHaveLength(2);
  });

  test("an overlapping but unequal span is a distinct mark", () => {
    const store = makeStore();
    const { addMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(3, 6) });
    addMark({ id: "b", kind: "stumbled", span: span(3, 7) });
    expect(store.getState().session.currentAttempt.marks).toHaveLength(2);
  });

  test("a dismissed mark does not block re-marking its span", () => {
    const store = makeStore();
    const { addMark, dismissMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(3, 6) });
    dismissMark("a");
    addMark({ id: "b", kind: "stumbled", span: span(3, 6) });
    const marks = store.getState().session.currentAttempt.marks;
    expect(marks.map((m) => [m.id, m.status])).toEqual([
      ["a", "dismissed"],
      ["b", "open"],
    ]);
  });

  test("removes a mark outright, leaving the rest", () => {
    const store = makeStore();
    const { addMark, removeMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(0, 1) });
    addMark({ id: "b", kind: "odd-word", span: span(2, 4) });
    removeMark("a");
    expect(store.getState().session.currentAttempt.marks.map((m) => m.id)).toEqual(["b"]);
  });

  test("removing frees the span to be marked again", () => {
    const store = makeStore();
    const { addMark, removeMark } = store.getState().actions;
    addMark({ id: "a", kind: "stumbled", span: span(3, 6) });
    removeMark("a");
    addMark({ id: "b", kind: "stumbled", span: span(3, 6) });
    expect(store.getState().session.currentAttempt.marks.map((m) => m.id)).toEqual(["b"]);
  });

  test("removing an unknown id leaves the session untouched", () => {
    const store = makeStore();
    store.getState().actions.addMark({ id: "a", kind: "stumbled", span: span(0, 1) });
    const before = store.getState().session;
    store.getState().actions.removeMark("nope");
    expect(store.getState().session).toBe(before);
  });
});

describe("miss lists", () => {
  test("records misses and ignores a duplicate id within an activity", () => {
    const store = makeStore();
    const { recordMiss } = store.getState().actions;
    recordMiss("pronouns", { id: "p1", description: "the 'it'" });
    recordMiss("pronouns", { id: "p1", description: "changed" });
    const misses = activity(store.getState(), "pronouns").misses;
    expect(misses).toHaveLength(1);
    expect(misses[0]).toEqual({
      id: "p1",
      source: "pronouns",
      description: "the 'it'",
      status: "open",
    });
  });

  test("clears and dismisses misses by id", () => {
    const store = makeStore();
    const { recordMiss, clearMiss, dismissMiss } = store.getState().actions;
    recordMiss("sentences", { id: "s1", description: "sentence 1" });
    recordMiss("sentences", { id: "s2", description: "sentence 2" });
    clearMiss("sentences", "s1");
    dismissMiss("sentences", "s2");
    const byId = Object.fromEntries(
      activity(store.getState(), "sentences").misses.map((m) => [m.id, m.status]),
    );
    expect(byId).toEqual({ s1: "cleared", s2: "dismissed" });
  });
});

describe("selectGateItems", () => {
  test("lists open marks and open misses from Activities 3–4 only", () => {
    const store = makeStore();
    const a = store.getState().actions;
    a.addMark({ id: "open-mark", kind: "stumbled", span: span(0, 1) });
    a.addMark({ id: "resolved-mark", kind: "odd-word", span: span(2, 3) });
    a.resolveMark("resolved-mark");
    a.recordMiss("pronouns", { id: "p1", description: "pronoun miss" });
    a.recordMiss("sentences", { id: "s1", description: "sentence miss" });
    a.recordMiss("sentences", { id: "s2", description: "cleared miss" });
    a.clearMiss("sentences", "s2");
    // A glossary miss (Activity 5) belongs to the summary, not the gate.
    a.recordMiss("glossary", { id: "g1", description: "glossary miss" });

    const items = selectGateItems(store.getState().session);
    const marks = items.filter((i) => i.kind === "mark").map((i) => i.mark.id);
    const misses = items.filter((i) => i.kind === "miss").map((i) => i.miss.id);
    expect(marks).toEqual(["open-mark"]);
    expect(misses).toEqual(["p1", "s1"]);
  });

  test("is empty for a fresh session", () => {
    expect(selectGateItems(makeStore().getState().session)).toEqual([]);
  });
});

describe("finishAttempt", () => {
  test("archives the attempt and starts a fresh one for the same pack", () => {
    let clock = 5000;
    const store = makeStore({ now: () => clock });
    const a = store.getState().actions;
    a.addMark({ id: "m1", kind: "stumbled", span: span(0, 1) });
    a.commitActivity("pronouns", { total: 3, correct: 2 });
    a.recordMiss("pronouns", { id: "p1", description: "a miss" });

    clock = 9000;
    a.finishAttempt();

    const { session } = store.getState();
    expect(session.archivedAttempts).toHaveLength(1);
    const archived = session.archivedAttempts[0];
    expect(archived.index).toBe(1);
    expect(archived.finishedAt).toBe(9000);
    expect(archived.marks[0].id).toBe("m1");
    expect(archived.activities.pronouns.score).toEqual({ total: 3, correct: 2 });

    // The fresh attempt is empty and numbered next.
    expect(session.currentAttempt.index).toBe(2);
    expect(session.currentAttempt.startedAt).toBe(9000);
    expect(session.currentAttempt.marks).toEqual([]);
    expect(session.currentAttempt.activities.pronouns.committed).toBe(false);
    expect(session.currentAttempt.activities.pronouns.misses).toEqual([]);
  });
});

describe("write-through persistence", () => {
  test("persists every change to the injected storage", () => {
    const storage = createMemoryStorage();
    const store = makeStore({ storage });
    store.getState().actions.addMark({ id: "m1", kind: "stumbled", span: span(0, 1) });

    const loaded = loadSession(storage, "ozymandias", "hash1");
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.data.currentAttempt.marks[0].id).toBe("m1");
  });

  test("does not write when an action is a no-op", () => {
    let writes = 0;
    const memory = createMemoryStorage();
    const storage: SessionStorage = {
      ...memory,
      setItem: (k, v) => {
        writes += 1;
        memory.setItem(k, v);
      },
    };
    const store = makeStore({ storage });
    store.getState().actions.commitActivity("pronouns");
    expect(writes).toBe(1);
    // recordAnswers after commit changes nothing, so it must not write again.
    store.getState().actions.recordAnswers("pronouns", { "0": "late" });
    expect(writes).toBe(1);
  });

  test("a throwing storage does not break the session (best-effort persistence)", () => {
    const storage: SessionStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
      keys: () => [],
    };
    const store = makeStore({ storage });
    expect(() =>
      store.getState().actions.addMark({ id: "m1", kind: "stumbled", span: span(0, 1) }),
    ).not.toThrow();
    expect(store.getState().session.currentAttempt.marks).toHaveLength(1);
  });

  test("a store created without storage still works", () => {
    const store = makeStore();
    expect(() => store.getState().actions.finishAttempt()).not.toThrow();
    expect(store.getState().session.currentAttempt.index).toBe(2);
  });
});
