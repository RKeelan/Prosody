import { describe, expect, test } from "bun:test";
import {
  clearGloss,
  coerceGlossaryAnswer,
  emptyGlossaryAnswer,
  glossedCount,
  glossFor,
  setPrimarySense,
  setSecondarySense,
} from "./glossaryAnswer";

describe("setPrimarySense", () => {
  test("records a trimmed primary sense for a word", () => {
    const answer = setPrimarySense(emptyGlossaryAnswer(), 3, "  the face  ");
    expect(glossFor(answer, 3)).toEqual({ primary: "the face" });
  });

  test("empty or whitespace text clears the whole gloss", () => {
    const answer = setPrimarySense(emptyGlossaryAnswer(), 3, "the face");
    expect(glossFor(setPrimarySense(answer, 3, "   "), 3)).toBeUndefined();
  });

  test("keeps an existing secondary sense when the primary changes", () => {
    let answer = setPrimarySense(emptyGlossaryAnswer(), 3, "ridiculed");
    answer = setSecondarySense(answer, 3, "imitated in stone");
    answer = setPrimarySense(answer, 3, "mocked, ridiculed");
    expect(glossFor(answer, 3)).toEqual({
      primary: "mocked, ridiculed",
      secondary: "imitated in stone",
    });
  });
});

describe("setSecondarySense", () => {
  test("adds a second sense to a glossed word, keeping the primary", () => {
    let answer = setPrimarySense(emptyGlossaryAnswer(), 5, "physically carried");
    answer = setSecondarySense(answer, 5, "  bore up emotionally  ");
    expect(glossFor(answer, 5)).toEqual({
      primary: "physically carried",
      secondary: "bore up emotionally",
    });
  });

  test("is a no-op on a word with no primary sense", () => {
    const answer = setSecondarySense(emptyGlossaryAnswer(), 5, "a second meaning");
    expect(glossFor(answer, 5)).toBeUndefined();
  });

  test("empty text drops the secondary sense, leaving the primary", () => {
    let answer = setPrimarySense(emptyGlossaryAnswer(), 5, "carried");
    answer = setSecondarySense(answer, 5, "bore up");
    answer = setSecondarySense(answer, 5, "");
    expect(glossFor(answer, 5)).toEqual({ primary: "carried" });
  });
});

describe("clearGloss and glossedCount", () => {
  test("clearGloss removes a gloss and is a no-op when absent", () => {
    const answer = setPrimarySense(emptyGlossaryAnswer(), 1, "a boat");
    expect(glossedCount(clearGloss(answer, 1))).toBe(0);
    expect(clearGloss(answer, 99)).toBe(answer);
  });

  test("glossedCount counts distinct glossed words", () => {
    let answer = setPrimarySense(emptyGlossaryAnswer(), 1, "a");
    answer = setPrimarySense(answer, 4, "b");
    expect(glossedCount(answer)).toBe(2);
  });
});

describe("coerceGlossaryAnswer", () => {
  test("keeps well-formed glosses within the token range", () => {
    const raw = {
      glosses: { 2: { primary: "a face" }, 5: { primary: "carried", secondary: "bore up" } },
    };
    const answer = coerceGlossaryAnswer(raw, 10);
    expect(answer.glosses).toEqual({
      2: { primary: "a face" },
      5: { primary: "carried", secondary: "bore up" },
    });
  });

  test("drops out-of-range indices and empty or missing primary senses", () => {
    const raw = {
      glosses: {
        2: { primary: "kept" },
        50: { primary: "out of range" },
        3: { primary: "   " },
        4: { secondary: "no primary" },
      },
    };
    expect(coerceGlossaryAnswer(raw, 10).glosses).toEqual({ 2: { primary: "kept" } });
  });

  test("drops a blank secondary sense but keeps its primary", () => {
    const raw = { glosses: { 2: { primary: "kept", secondary: "  " } } };
    expect(coerceGlossaryAnswer(raw, 10).glosses).toEqual({ 2: { primary: "kept" } });
  });

  test("tolerates junk, null, and a missing glosses field", () => {
    expect(coerceGlossaryAnswer(null, 10).glosses).toEqual({});
    expect(coerceGlossaryAnswer({ glosses: "nope" }, 10).glosses).toEqual({});
    expect(coerceGlossaryAnswer({ glosses: { 2: 7 } }, 10).glosses).toEqual({});
  });
});
