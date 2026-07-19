import { describe, expect, test } from "bun:test";
import { freshSession, type SessionData } from "./model";
import { deserialiseSession, ENVELOPE_VERSION, serialiseSession } from "./serialise";

/** A session with content in every corner, to make the round trip meaningful. */
function populatedSession(): SessionData {
  const session = freshSession("ozymandias", "abc123", 1000);
  return {
    ...session,
    currentAttempt: {
      ...session.currentAttempt,
      marks: [{ id: "m1", kind: "stumbled", span: { start: 0, end: 2 }, status: "open" }],
      activities: {
        ...session.currentAttempt.activities,
        pronouns: {
          answers: { "0": { kind: "span", start: 3 } },
          committed: true,
          misses: [{ id: "p1", source: "pronouns", description: "the 'it'", status: "open" }],
          score: { total: 3, correct: 2 },
        },
      },
    },
    archivedAttempts: [{ ...session.currentAttempt, index: 1, startedAt: 500, finishedAt: 900 }],
  };
}

describe("serialise/deserialise round trip", () => {
  test("a fresh session survives unchanged", () => {
    const session = freshSession("the-lost-boat", "deadbeef", 42);
    const result = deserialiseSession(serialiseSession(session));
    expect(result).toEqual({ ok: true, data: session });
  });

  test("a populated session survives unchanged", () => {
    const session = populatedSession();
    const result = deserialiseSession(serialiseSession(session));
    expect(result).toEqual({ ok: true, data: session });
  });

  test("the stored form carries the envelope version", () => {
    const stored = JSON.parse(serialiseSession(freshSession("p", "h", 0)));
    expect(stored.version).toBe(ENVELOPE_VERSION);
    expect(stored.data.packId).toBe("p");
  });
});

describe("deserialiseSession fails soft", () => {
  test("on invalid JSON", () => {
    const result = deserialiseSession("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not valid JSON");
  });

  test("on a future envelope version", () => {
    const stored = JSON.stringify({ version: ENVELOPE_VERSION + 1, data: {} });
    const result = deserialiseSession(stored);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("version");
  });

  test("on a schema violation, pointing at the offending field", () => {
    const session = freshSession("ok-pack", "hash", 0);
    const broken = { version: ENVELOPE_VERSION, data: { ...session, packId: "Not A Slug" } };
    const result = deserialiseSession(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("packId");
  });

  test("on a non-object payload", () => {
    expect(deserialiseSession("42").ok).toBe(false);
    expect(deserialiseSession("null").ok).toBe(false);
  });
});
