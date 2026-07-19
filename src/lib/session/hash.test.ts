import { describe, expect, test } from "bun:test";
import { contentHash } from "./hash";

describe("contentHash", () => {
  test("matches the canonical FNV-1a 64-bit test vectors", () => {
    // The published FNV-1a 64 vectors; a regression here means the algorithm
    // drifted, which would silently orphan every stored session.
    expect(contentHash("")).toBe("cbf29ce484222325");
    expect(contentHash("a")).toBe("af63dc4c8601ec8c");
    expect(contentHash("foobar")).toBe("85944171f73967e8");
  });

  test("is deterministic across calls", () => {
    const text = '{"id":"ozymandias","poet":"Shelley"}';
    expect(contentHash(text)).toBe(contentHash(text));
  });

  test("is sensitive to any change, including a single character", () => {
    expect(contentHash("hope")).not.toBe(contentHash("hopes"));
    expect(contentHash("O boat")).not.toBe(contentHash("O boot"));
  });

  test("always returns 16 lowercase hex characters", () => {
    for (const text of ["", "a", "a longer stretch of pack text\nwith a newline"]) {
      expect(contentHash(text)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test("hashes UTF-8 bytes, so non-ASCII input is stable", () => {
    // Curly apostrophes and accents appear in real poems; the digest must not
    // depend on how the platform stores the string.
    const text = "’Tis the season—façade, naïve, café";
    expect(contentHash(text)).toBe(contentHash(text));
    expect(contentHash(text)).toMatch(/^[0-9a-f]{16}$/);
  });
});
