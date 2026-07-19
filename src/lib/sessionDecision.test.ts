import { describe, expect, test } from "bun:test";
import { createMemoryStorage, freshSession, saveSession, sessionKey } from "./session";
import { decideSession } from "./sessionDecision";

describe("decideSession", () => {
  test("resumes an exact packId+contentHash match", () => {
    const storage = createMemoryStorage();
    const session = freshSession("ozymandias", "hash1", 100);
    saveSession(storage, session);

    const decision = decideSession(storage, "ozymandias", "hash1");
    expect(decision).toEqual({ kind: "resume", session });
  });

  test("starts fresh when nothing is stored for this pack id at all", () => {
    const decision = decideSession(createMemoryStorage(), "ozymandias", "hash1");
    expect(decision).toEqual({ kind: "fresh" });
  });

  test("offers keep-or-fresh when progress exists under a different hash", () => {
    const storage = createMemoryStorage();
    const stale = freshSession("ozymandias", "old-hash", 100);
    saveSession(storage, stale);

    const decision = decideSession(storage, "ozymandias", "new-hash");
    expect(decision).toEqual({
      kind: "offer-keep-or-fresh",
      staleHash: "old-hash",
      staleSession: stale,
    });
  });

  test("picks the most recently started attempt among multiple stale hashes", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("ozymandias", "hash-a", 100));
    const newest = freshSession("ozymandias", "hash-b", 300);
    saveSession(storage, newest);
    saveSession(storage, freshSession("ozymandias", "hash-c", 200));

    const decision = decideSession(storage, "ozymandias", "hash-current");
    expect(decision).toEqual({
      kind: "offer-keep-or-fresh",
      staleHash: "hash-b",
      staleSession: newest,
    });
  });

  test("ignores other packs' sessions entirely", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("kubla-khan", "some-hash", 100));

    const decision = decideSession(storage, "ozymandias", "hash1");
    expect(decision).toEqual({ kind: "fresh" });
  });

  test("a corrupt entry at the exact hash falls through to checking stale hashes", () => {
    const storage = createMemoryStorage({ [sessionKey("ozymandias", "hash1")]: "{corrupt" });
    const stale = freshSession("ozymandias", "old-hash", 50);
    saveSession(storage, stale);

    const decision = decideSession(storage, "ozymandias", "hash1");
    expect(decision).toEqual({
      kind: "offer-keep-or-fresh",
      staleHash: "old-hash",
      staleSession: stale,
    });
  });

  test("a corrupt entry at the exact hash, with nothing else, starts fresh", () => {
    const storage = createMemoryStorage({ [sessionKey("ozymandias", "hash1")]: "{corrupt" });
    expect(decideSession(storage, "ozymandias", "hash1")).toEqual({ kind: "fresh" });
  });

  test("a corrupt entry at a stale hash is excluded from candidates", () => {
    const storage = createMemoryStorage({ [sessionKey("ozymandias", "old-hash")]: "{corrupt" });
    const decision = decideSession(storage, "ozymandias", "new-hash");
    expect(decision).toEqual({ kind: "fresh" });
  });
});
