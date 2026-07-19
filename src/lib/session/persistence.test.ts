import { describe, expect, test } from "bun:test";
import { freshSession } from "./model";
import {
  listSessionsForPack,
  loadSession,
  parseSessionKey,
  rekeySession,
  STORAGE_PREFIX,
  saveSession,
  sessionKey,
} from "./persistence";
import { serialiseSession } from "./serialise";
import { createMemoryStorage } from "./storage";

describe("session keys", () => {
  test("sessionKey builds a prefixed pack-id/content-hash key", () => {
    expect(sessionKey("ozymandias", "abc123")).toBe(`${STORAGE_PREFIX}:ozymandias:abc123`);
  });

  test("parseSessionKey round-trips a well-formed key", () => {
    expect(parseSessionKey(sessionKey("my-pack", "deadbeef"))).toEqual({
      packId: "my-pack",
      contentHash: "deadbeef",
    });
  });

  test("parseSessionKey rejects keys that are not ours", () => {
    expect(parseSessionKey("other:namespace:p:h")).toBeNull();
    expect(parseSessionKey("prosody:session:p")).toBeNull();
    expect(parseSessionKey("prosody:session:p:h:extra")).toBeNull();
    expect(parseSessionKey("prosody:session::h")).toBeNull();
  });
});

describe("loadSession and saveSession", () => {
  test("save then load returns the same session", () => {
    const storage = createMemoryStorage();
    const session = freshSession("ozymandias", "hash1", 100);
    saveSession(storage, session);
    expect(loadSession(storage, "ozymandias", "hash1")).toEqual({ ok: true, data: session });
  });

  test("load returns null when nothing is stored", () => {
    expect(loadSession(createMemoryStorage(), "ozymandias", "hash1")).toBeNull();
  });

  test("load surfaces a corrupt entry as a soft failure", () => {
    const storage = createMemoryStorage({ [sessionKey("p", "h")]: "{corrupt" });
    const result = loadSession(storage, "p", "h");
    expect(result?.ok).toBe(false);
  });
});

describe("listSessionsForPack", () => {
  test("returns every hash for a pack id and ignores other packs and foreign keys", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("ozymandias", "hash1", 0));
    saveSession(storage, freshSession("ozymandias", "hash2", 0));
    saveSession(storage, freshSession("kubla-khan", "hash3", 0));
    storage.setItem("unrelated-key", "junk");

    const refs = listSessionsForPack(storage, "ozymandias");
    expect(refs.map((r) => r.contentHash).sort()).toEqual(["hash1", "hash2"]);
    expect(refs.every((r) => r.packId === "ozymandias")).toBe(true);
    expect(refs.map((r) => r.key).sort()).toEqual([
      sessionKey("ozymandias", "hash1"),
      sessionKey("ozymandias", "hash2"),
    ]);
  });

  test("returns nothing for a pack with no sessions", () => {
    expect(listSessionsForPack(createMemoryStorage(), "ozymandias")).toEqual([]);
  });
});

describe("rekeySession", () => {
  test("moves a session onto a new hash and updates its embedded hash", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("ozymandias", "old", 100));

    expect(rekeySession(storage, "ozymandias", "old", "new")).toBe(true);
    expect(storage.getItem(sessionKey("ozymandias", "old"))).toBeNull();

    const moved = loadSession(storage, "ozymandias", "new");
    expect(moved?.ok).toBe(true);
    if (moved?.ok) expect(moved.data.contentHash).toBe("new");
  });

  test("returns false when there is nothing to move", () => {
    expect(rekeySession(createMemoryStorage(), "ozymandias", "old", "new")).toBe(false);
  });

  test("returns false when the source entry is corrupt, leaving it in place", () => {
    const storage = createMemoryStorage({ [sessionKey("p", "old")]: "{corrupt" });
    expect(rekeySession(storage, "p", "old", "new")).toBe(false);
    expect(storage.getItem(sessionKey("p", "old"))).toBe("{corrupt");
    expect(storage.getItem(sessionKey("p", "new"))).toBeNull();
  });

  test("a no-op rekey (old equals new) reports presence without touching storage", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("p", "h", 0));
    const before = storage.getItem(sessionKey("p", "h"));
    expect(rekeySession(storage, "p", "h", "h")).toBe(true);
    expect(storage.getItem(sessionKey("p", "h"))).toBe(before);
    expect(rekeySession(createMemoryStorage(), "p", "h", "h")).toBe(false);
  });

  test("the moved session deserialises to the same stored form save would write", () => {
    const storage = createMemoryStorage();
    saveSession(storage, freshSession("p", "old", 7));
    rekeySession(storage, "p", "old", "new");
    const expected = serialiseSession({ ...freshSession("p", "old", 7), contentHash: "new" });
    expect(storage.getItem(sessionKey("p", "new"))).toBe(expected);
  });
});
