import { describe, expect, test } from "bun:test";
import { sameSpan, spansOverlap } from "./grade";

describe("spansOverlap", () => {
  test("overlapping spans share a token", () => {
    expect(spansOverlap({ start: 0, end: 3 }, { start: 2, end: 5 })).toBe(true);
  });

  test("adjacent spans do not overlap", () => {
    expect(spansOverlap({ start: 0, end: 2 }, { start: 2, end: 4 })).toBe(false);
  });

  test("disjoint spans do not overlap", () => {
    expect(spansOverlap({ start: 0, end: 1 }, { start: 5, end: 6 })).toBe(false);
  });

  test("containment counts as overlap in both directions", () => {
    expect(spansOverlap({ start: 0, end: 10 }, { start: 3, end: 4 })).toBe(true);
    expect(spansOverlap({ start: 3, end: 4 }, { start: 0, end: 10 })).toBe(true);
  });
});

describe("sameSpan", () => {
  test("true only when both ends match", () => {
    expect(sameSpan({ start: 2, end: 5 }, { start: 2, end: 5 })).toBe(true);
    expect(sameSpan({ start: 2, end: 5 }, { start: 2, end: 6 })).toBe(false);
    expect(sameSpan({ start: 2, end: 5 }, { start: 1, end: 5 })).toBe(false);
  });

  test("overlapping spans are not the same span", () => {
    const a = { start: 0, end: 4 };
    const b = { start: 2, end: 6 };
    expect(spansOverlap(a, b)).toBe(true);
    expect(sameSpan(a, b)).toBe(false);
  });
});
