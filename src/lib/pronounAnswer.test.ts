import { describe, expect, test } from "bun:test";
import {
  answeredCount,
  clearResponse,
  coercePronounAnswer,
  emptyPronounAnswer,
  responseFor,
  withSpanResponse,
  withTextResponse,
} from "./pronounAnswer";

const span = (start: number, end: number) => ({ start, end });

describe("editors", () => {
  test("records span and text responses without mutating the source", () => {
    const empty = emptyPronounAnswer();
    const withSpan = withSpanResponse(empty, 0, span(3, 4));
    const withText = withTextResponse(withSpan, 1, "the speaker");

    expect(responseFor(withText, 0)).toEqual({ kind: "span", span: span(3, 4) });
    expect(responseFor(withText, 1)).toEqual({ kind: "text", text: "the speaker" });
    // The originals are untouched.
    expect(empty.responses).toEqual({});
    expect(responseFor(withSpan, 1)).toBeUndefined();
  });

  test("a later response replaces an earlier one for the same pronoun", () => {
    let answer = withSpanResponse(emptyPronounAnswer(), 0, span(3, 4));
    answer = withTextResponse(answer, 0, "the statue");
    expect(responseFor(answer, 0)).toEqual({ kind: "text", text: "the statue" });
  });

  test("typed text is trimmed, and blank text clears the response", () => {
    let answer = withTextResponse(emptyPronounAnswer(), 0, "  the sculptor  ");
    expect(responseFor(answer, 0)).toEqual({ kind: "text", text: "the sculptor" });
    answer = withTextResponse(answer, 0, "   ");
    expect(responseFor(answer, 0)).toBeUndefined();
  });

  test("clearResponse drops a response and is a no-op for an unresolved pronoun", () => {
    const answer = withSpanResponse(emptyPronounAnswer(), 2, span(0, 1));
    expect(answeredCount(clearResponse(answer, 2))).toBe(0);
    expect(clearResponse(answer, 5)).toBe(answer);
  });

  test("answeredCount counts resolved pronouns only", () => {
    let answer = emptyPronounAnswer();
    expect(answeredCount(answer)).toBe(0);
    answer = withSpanResponse(answer, 0, span(1, 2));
    answer = withTextResponse(answer, 3, "the boat");
    expect(answeredCount(answer)).toBe(2);
  });
});

describe("coercePronounAnswer", () => {
  test("keeps well-formed span and text responses within range", () => {
    const raw = {
      responses: {
        0: { kind: "span", span: { start: 2, end: 5 } },
        1: { kind: "text", text: "  the speaker  " },
      },
    };
    const answer = coercePronounAnswer(raw, 3);
    expect(responseFor(answer, 0)).toEqual({ kind: "span", span: span(2, 5) });
    expect(responseFor(answer, 1)).toEqual({ kind: "text", text: "the speaker" });
  });

  test("drops responses out of range, of unknown kind, or malformed", () => {
    const raw = {
      responses: {
        0: { kind: "span", span: { start: 4, end: 4 } }, // empty span
        1: { kind: "span", span: { start: 5, end: 2 } }, // inverted
        2: { kind: "text", text: "   " }, // blank
        3: { kind: "mystery", value: 1 }, // unknown kind
        5: { kind: "span", span: { start: 0, end: 1 } }, // index >= count
      },
    };
    expect(coercePronounAnswer(raw, 4).responses).toEqual({});
  });

  test("tolerates absent or non-object input", () => {
    expect(coercePronounAnswer(undefined, 2).responses).toEqual({});
    expect(coercePronounAnswer(null, 2).responses).toEqual({});
    expect(coercePronounAnswer({ responses: 42 }, 2).responses).toEqual({});
  });
});
