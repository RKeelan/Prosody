import { describe, expect, test } from "bun:test";
import { ActiveActivities } from "../pack/metadata";
import {
  ACTIVITY_KEYS,
  ActivityStates,
  freshAttempt,
  freshSession,
  GATE_MISS_SOURCES,
  Mark,
  Miss,
  SessionData,
  TokenSpanSchema,
} from "./model";

/** The activity keys as a plain sorted string array, for order-independent comparison. */
const sortedKeys = (keys: readonly string[]) => [...keys].sort();

describe("activity keys", () => {
  test("cover exactly the pack's active-activity flags", () => {
    expect(sortedKeys(ACTIVITY_KEYS)).toEqual(sortedKeys(Object.keys(ActiveActivities.shape)));
  });

  test("ActivityStates has one field per activity key", () => {
    expect(sortedKeys(Object.keys(ActivityStates.shape))).toEqual(sortedKeys(ACTIVITY_KEYS));
  });

  test("the gate draws misses only from Activities 3 and 4", () => {
    const sources: string[] = [...GATE_MISS_SOURCES];
    expect(sources).toEqual(["pronouns", "sentences"]);
  });
});

describe("schema defaults", () => {
  test("a mark defaults to open", () => {
    const mark = Mark.parse({ id: "m1", kind: "stumbled", span: { start: 0, end: 2 } });
    expect(mark.status).toBe("open");
  });

  test("a miss defaults to open", () => {
    const miss = Miss.parse({ id: "x1", source: "pronouns", description: "the 'it' in line 2" });
    expect(miss.status).toBe("open");
  });

  test("an activity state defaults to uncommitted with no misses or score", () => {
    const state = ActivityStates.parse({}).scansion;
    expect(state.committed).toBe(false);
    expect(state.misses).toEqual([]);
    expect(state.score).toBeUndefined();
  });
});

describe("TokenSpanSchema", () => {
  test("accepts a well-formed half-open span", () => {
    expect(TokenSpanSchema.parse({ start: 3, end: 5 })).toEqual({ start: 3, end: 5 });
  });

  test("rejects an empty or inverted span", () => {
    expect(TokenSpanSchema.safeParse({ start: 2, end: 2 }).success).toBe(false);
    expect(TokenSpanSchema.safeParse({ start: 5, end: 3 }).success).toBe(false);
  });
});

describe("fresh-state builders", () => {
  test("freshAttempt starts empty at the given index and time", () => {
    const attempt = freshAttempt(2, 1000);
    expect(attempt.index).toBe(2);
    expect(attempt.startedAt).toBe(1000);
    expect(attempt.marks).toEqual([]);
    expect(attempt.activities.pronouns.committed).toBe(false);
  });

  test("freshSession is a valid, parseable SessionData at attempt 1", () => {
    const session = freshSession("ozymandias", "abc123", 500);
    expect(session.currentAttempt.index).toBe(1);
    expect(session.archivedAttempts).toEqual([]);
    expect(SessionData.safeParse(session).success).toBe(true);
  });
});
