import { describe, expect, test } from "bun:test";
import { poemSyllables, resolveSyllabifications } from "./syllables";
import { tokenisePoem } from "./tokenise";

/** Tokenise a poem from bare line arrays plus optional syllabifications. */
function build(lines: string[][], syllabifications: { word: string; syllables: string[] }[] = []) {
  const tokenised = tokenisePoem({
    stanzas: lines.map((l) => ({ lines: l })),
    syllabifications: syllabifications.map((s) => ({
      word: { exact: s.word },
      syllables: s.syllables,
    })),
  });
  const resolved = resolveSyllabifications(
    tokenised.tokens,
    syllabifications.map((s) => ({ word: { exact: s.word }, syllables: s.syllables })),
  );
  return { tokenised, resolved };
}

describe("resolveSyllabifications", () => {
  test("resolves each entry to its word span and chunks", () => {
    const { tokenised, resolved } = build(
      [["A traveller came"]],
      [{ word: "traveller", syllables: ["trav", "eller"] }],
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].syllables).toEqual(["trav", "eller"]);
    expect(tokenised.tokens.slice(resolved[0].span.start, resolved[0].span.end)[0].text).toBe(
      "traveller",
    );
  });

  test("drops an entry whose anchor does not resolve", () => {
    const { resolved } = build([["A traveller came"]], [{ word: "nowhere", syllables: ["no"] }]);
    expect(resolved).toEqual([]);
  });
});

describe("poemSyllables", () => {
  test("a word without an entry counts as one syllable, taken whole", () => {
    const { tokenised, resolved } = build([["cold grey waves"]]);
    const [line] = poemSyllables(tokenised, resolved);
    expect(line.words.map((w) => w.text)).toEqual(["cold", "grey", "waves"]);
    expect(line.words.every((w) => w.syllables.length === 1 && !w.fromSyllabification)).toBe(true);
    expect(line.syllableCount).toBe(3);
  });

  test("a word with an entry splits into its chunks and counts them", () => {
    const { tokenised, resolved } = build(
      [["A traveller"]],
      [{ word: "traveller", syllables: ["trav", "eller"] }],
    );
    const [line] = poemSyllables(tokenised, resolved);
    const traveller = line.words.find((w) => w.text === "traveller");
    expect(traveller?.syllables).toEqual(["trav", "eller"]);
    expect(traveller?.fromSyllabification).toBe(true);
    // "A"(1) + "traveller"(2)
    expect(line.syllableCount).toBe(3);
  });

  test("syllableStart accumulates across a line, skipping punctuation", () => {
    const { tokenised, resolved } = build(
      [["My name is Ozymandias, King"]],
      [{ word: "Ozymandias", syllables: ["O", "zy", "man", "dias"] }],
    );
    const [line] = poemSyllables(tokenised, resolved);
    const starts = Object.fromEntries(line.words.map((w) => [w.text, w.syllableStart]));
    // My(1) name(1) is(1) Ozymandias(4) King(1) → starts 0,1,2,3,7
    expect(starts.My).toBe(0);
    expect(starts.Ozymandias).toBe(3);
    expect(starts.King).toBe(7);
    expect(line.syllableCount).toBe(8);
  });

  test("punctuation between words never becomes a syllable", () => {
    const { tokenised, resolved } = build([["Stand in the desert. Near"]]);
    const [line] = poemSyllables(tokenised, resolved);
    expect(line.words.map((w) => w.text)).toEqual(["Stand", "in", "the", "desert", "Near"]);
    expect(line.syllableCount).toBe(5);
  });

  test("every poem line yields a LineSyllables in order", () => {
    const { tokenised, resolved } = build([["one two"], ["three four five"]]);
    const lines = poemSyllables(tokenised, resolved);
    expect(lines.map((l) => l.lineIndex)).toEqual([0, 1]);
    expect(lines.map((l) => l.syllableCount)).toEqual([2, 3]);
  });
});
