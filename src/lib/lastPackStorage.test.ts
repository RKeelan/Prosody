import { describe, expect, test } from "bun:test";
import {
  clearLastPackText,
  LAST_PACK_KEY,
  loadLastPackText,
  saveLastPackText,
} from "./lastPackStorage";
import { createMemoryStorage } from "./session";

describe("last-pack storage", () => {
  test("nothing cached returns null", () => {
    expect(loadLastPackText(createMemoryStorage())).toBeNull();
  });

  test("save then load round-trips the raw text", () => {
    const storage = createMemoryStorage();
    saveLastPackText(storage, '{"id":"ozymandias"}');
    expect(loadLastPackText(storage)).toBe('{"id":"ozymandias"}');
  });

  test("clear removes the cached text without touching other keys", () => {
    const storage = createMemoryStorage({ "prosody:session:ozymandias:abc": "progress" });
    saveLastPackText(storage, "raw text");
    clearLastPackText(storage);
    expect(loadLastPackText(storage)).toBeNull();
    expect(storage.getItem("prosody:session:ozymandias:abc")).toBe("progress");
  });

  test("stores under the documented key", () => {
    const storage = createMemoryStorage();
    saveLastPackText(storage, "x");
    expect(storage.getItem(LAST_PACK_KEY)).toBe("x");
  });
});
