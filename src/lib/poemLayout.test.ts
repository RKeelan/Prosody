import { describe, expect, test } from "bun:test";
import type { Poem } from "./pack";
import { layOutPoem } from "./poemLayout";
import { tokenisePoem } from "./tokenise";

function poemOf(...stanzas: string[][]): Poem {
  return { stanzas: stanzas.map((lines) => ({ lines })), syllabifications: [] };
}

/** Reassemble a laid-out line from its gaps and token texts. */
function rebuild(tokens: readonly { gapBefore: string; token: { text: string } }[]): string {
  return tokens.map((t) => t.gapBefore + t.token.text).join("");
}

describe("stanza and line grouping", () => {
  test("groups lines under their stanzas", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["One line.", "Two line."], ["Red fish."])));
    expect(stanzas.map((s) => s.stanzaIndex)).toEqual([0, 1]);
    expect(stanzas.map((s) => s.lines.map((l) => l.text))).toEqual([
      ["One line.", "Two line."],
      ["Red fish."],
    ]);
  });

  test("line indices are global and numbers are 1-based", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["A.", "B."], ["C."])));
    const lines = stanzas.flatMap((s) => s.lines);
    expect(lines.map((l) => l.lineIndex)).toEqual([0, 1, 2]);
    expect(lines.map((l) => l.number)).toEqual([1, 2, 3]);
  });

  test("token indices stay in the global token space", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["Alpha beta"], ["Gamma"])));
    const indices = stanzas.flatMap((s) =>
      s.lines.flatMap((l) => l.tokens.map((t) => t.token.index)),
    );
    expect(indices).toEqual([0, 1, 2]);
  });

  test("a tokenless line still renders, empty, in its neighbours' stanza", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["Alpha", " ", "Beta"])));
    expect(stanzas).toHaveLength(1);
    expect(stanzas[0].lines.map((l) => l.tokens.length)).toEqual([1, 0, 1]);
  });
});

describe("gap reconstruction", () => {
  test("a line's gaps and tokens rebuild its source text exactly", () => {
    const line = '  Who said—"Two vast and trunkless legs of stone';
    const stanzas = layOutPoem(tokenisePoem(poemOf([line])));
    expect(rebuild(stanzas[0].lines[0].tokens)).toBe(line);
  });

  test("leading indentation is the first token's gap", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["    Indented line"])));
    expect(stanzas[0].lines[0].tokens[0].gapBefore).toBe("    ");
  });

  test("punctuation abutting a word carries no gap", () => {
    const stanzas = layOutPoem(tokenisePoem(poemOf(["Hello, world"])));
    expect(stanzas[0].lines[0].tokens.map((t) => t.gapBefore)).toEqual(["", "", " "]);
  });

  test("every line of the fixture-shaped poem rebuilds exactly", () => {
    const lines = [
      "I met a traveller from an antique land,",
      "Stand in the desert. . . . Near them, on the sand,",
      'The lone and level sands stretch far away."',
    ];
    const stanzas = layOutPoem(tokenisePoem(poemOf(lines)));
    expect(stanzas[0].lines.map((l) => rebuild(l.tokens))).toEqual(lines);
  });
});
