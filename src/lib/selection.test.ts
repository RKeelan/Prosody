import { describe, expect, test } from "bun:test";
import type { Poem } from "./pack";
import {
  clearSelection,
  EMPTY_SELECTION,
  isTokenSelected,
  type Selection,
  selectionSpan,
  selectionText,
  tapToken,
} from "./selection";
import { tokenisePoem } from "./tokenise";

/** Replay a sequence of taps from the empty selection. */
function taps(...indices: number[]): Selection {
  return indices.reduce<Selection>(tapToken, EMPTY_SELECTION);
}

describe("forming a span", () => {
  test("the first tap anchors a one-token selection", () => {
    expect(taps(3)).toEqual({ phase: "anchored", anchor: 3 });
    expect(selectionSpan(taps(3))).toEqual({ start: 3, end: 4 });
  });

  test("the second tap closes the span, inclusive of both ends", () => {
    expect(selectionSpan(taps(2, 5))).toEqual({ start: 2, end: 6 });
  });

  test("tapping backwards selects the same span", () => {
    expect(selectionSpan(taps(5, 2))).toEqual(selectionSpan(taps(2, 5)));
  });

  test("a two-token span covers the punctuation lying between its ends", () => {
    // "Hello , world" — words at 0 and 2, comma at 1.
    const span = selectionSpan(taps(0, 2));
    expect(span).toEqual({ start: 0, end: 3 });
  });

  test("nothing is selected to begin with", () => {
    expect(selectionSpan(EMPTY_SELECTION)).toBeNull();
  });
});

describe("cancelling and starting over", () => {
  test("tapping the anchor again cancels the half-formed selection", () => {
    expect(taps(4, 4)).toEqual(EMPTY_SELECTION);
  });

  test("a tap on a complete selection starts a fresh one", () => {
    expect(taps(2, 5, 9)).toEqual({ phase: "anchored", anchor: 9 });
  });

  test("a tap inside a complete selection also starts fresh, not an edge drag", () => {
    expect(taps(2, 8, 4)).toEqual({ phase: "anchored", anchor: 4 });
  });

  test("adjusting is re-tapping both ends", () => {
    expect(selectionSpan(taps(2, 8, 3, 6))).toEqual({ start: 3, end: 7 });
  });

  test("clearSelection empties any state", () => {
    expect(clearSelection()).toEqual(EMPTY_SELECTION);
  });
});

describe("membership", () => {
  test("reports every token within the span and none outside it", () => {
    const selection = taps(2, 4);
    expect([1, 2, 3, 4, 5].map((i) => isTokenSelected(selection, i))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  test("no token is selected when the selection is empty", () => {
    expect(isTokenSelected(EMPTY_SELECTION, 0)).toBe(false);
  });
});

describe("selection text", () => {
  const poem: Poem = {
    stanzas: [{ lines: ["I met a traveller from an antique land,", 'Who said—"Two vast'] }],
    syllabifications: [],
  };
  const { tokens, lines } = tokenisePoem(poem);
  const indexOf = (text: string) => tokens.findIndex((t) => t.text === text);

  test("reproduces the poem's own spacing within a line", () => {
    const selection = taps(indexOf("a"), indexOf("antique"));
    expect(selectionText(selection, lines, tokens)).toBe("a traveller from an antique");
  });

  test("keeps punctuation flush with the word it follows", () => {
    const selection = taps(indexOf("antique"), indexOf("land"));
    // The trailing comma sits outside the span; the selection stops at "land".
    expect(selectionText(selection, lines, tokens)).toBe("antique land");
  });

  test("a line break reads as a single space", () => {
    const selection = taps(indexOf("land"), indexOf("Who"));
    expect(selectionText(selection, lines, tokens)).toBe("land, Who");
  });

  test("an empty selection has no text", () => {
    expect(selectionText(EMPTY_SELECTION, lines, tokens)).toBe("");
  });

  test("a span running past the last token stops at the end of the poem", () => {
    const selection: Selection = { phase: "complete", anchor: 0, focus: tokens.length + 5 };
    expect(selectionText(selection, lines, tokens)).toStartWith("I met");
  });
});
