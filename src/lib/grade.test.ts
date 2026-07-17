import { describe, expect, test } from "bun:test";
import { spansOverlap } from "./grade";

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
