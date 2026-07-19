import { describe, expect, test } from "bun:test";
import type { Poem } from "./pack";
import {
  isWordToken,
  tokeniseFragment,
  tokenisePoem,
  wordTokenIndices,
  wordTokens,
} from "./tokenise";

/** Build a single-stanza poem from line strings, for tests that only need lines. */
function poemOf(...lines: string[]): Poem {
  return { stanzas: [{ lines }], syllabifications: [] };
}

describe("word/punctuation splitting", () => {
  test("splits words from surrounding punctuation", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["word", "Hello"],
      ["punctuation", ","],
      ["word", "world"],
      ["punctuation", "!"],
    ]);
  });

  test("digits count as word characters", () => {
    const { tokens } = tokenisePoem(poemOf("In 1802 he wrote."));
    expect(tokens.map((t) => t.text)).toEqual(["In", "1802", "he", "wrote", "."]);
  });

  test("an em dash never joins the words around it", () => {
    const { tokens } = tokenisePoem(poemOf("shape—the"));
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["word", "shape"],
      ["punctuation", "—"],
      ["word", "the"],
    ]);
  });
});

describe("apostrophe decision", () => {
  test("a straight apostrophe inside a word stays part of the word", () => {
    const { tokens } = tokenisePoem(poemOf("the land's edge"));
    expect(tokens.map((t) => t.text)).toEqual(["the", "land's", "edge"]);
  });

  test("a curly apostrophe (U+2019) inside a word stays part of the word", () => {
    const { tokens } = tokenisePoem(poemOf("the land’s edge"));
    expect(tokens.map((t) => t.text)).toEqual(["the", "land’s", "edge"]);
  });

  test("a leading apostrophe elision ('Tis) stays one word token", () => {
    const { tokens } = tokenisePoem(poemOf("'Tis the season"));
    expect(tokens.map((t) => t.text)).toEqual(["'Tis", "the", "season"]);
  });

  test("a trailing possessive apostrophe (boats') joins the word", () => {
    const { tokens } = tokenisePoem(poemOf("the boats' hulls"));
    expect(tokens.map((t) => t.text)).toEqual(["the", "boats'", "hulls"]);
  });

  test("a curly left single quote (U+2018) never joins a word—it always opens punctuation", () => {
    const { tokens } = tokenisePoem(poemOf("‘Hope’ is not a word."));
    // The opening curly quote stays its own punctuation token. The closing
    // curly quote is the documented, accepted leak: U+2019 is ambiguous
    // between "closing quote" and "apostrophe", and the tokeniser treats it
    // as the latter, fusing onto the preceding word.
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["punctuation", "‘"],
      ["word", "Hope’"],
      ["word", "is"],
      ["word", "not"],
      ["word", "a"],
      ["word", "word"],
      ["punctuation", "."],
    ]);
  });
});

describe("hyphen decision", () => {
  test("an internal hyphen joining two word runs stays one word token", () => {
    const { tokens } = tokenisePoem(poemOf("the sea-crossing begins"));
    expect(tokens.map((t) => t.text)).toEqual(["the", "sea-crossing", "begins"]);
  });

  test("a hyphen with no word character after it is its own punctuation token", () => {
    const { tokens } = tokenisePoem(poemOf("wait- then"));
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["word", "wait"],
      ["punctuation", "-"],
      ["word", "then"],
    ]);
  });
});

describe("global indices and position metadata", () => {
  test("indices are stable and contiguous across the whole poem", () => {
    const poem: Poem = {
      stanzas: [{ lines: ["One two."] }, { lines: ["Three four.", "Five."] }],
      syllabifications: [],
    };
    const { tokens } = tokenisePoem(poem);
    tokens.forEach((token, i) => {
      expect(token.index).toBe(i);
    });
  });

  test("stanza index, per-stanza line index, and global line index all track separately", () => {
    const poem: Poem = {
      stanzas: [{ lines: ["One two."] }, { lines: ["Three four.", "Five."] }],
      syllabifications: [],
    };
    const { tokens } = tokenisePoem(poem);

    const one = tokens.find((t) => t.text === "One");
    const three = tokens.find((t) => t.text === "Three");
    const five = tokens.find((t) => t.text === "Five");

    expect(one).toMatchObject({ stanzaIndex: 0, lineIndex: 0, lineIndexInStanza: 0 });
    // "Three" starts the second stanza's first line—global line index keeps
    // counting from the first stanza, but the per-stanza index resets.
    expect(three).toMatchObject({ stanzaIndex: 1, lineIndex: 1, lineIndexInStanza: 0 });
    expect(five).toMatchObject({ stanzaIndex: 1, lineIndex: 2, lineIndexInStanza: 1 });
  });

  test("character offsets locate the token within its line's raw text", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    const world = tokens.find((t) => t.text === "world");
    expect(world).toMatchObject({ charStart: 7, charEnd: 12 });
    expect("Hello, world!".slice(7, 12)).toBe("world");
  });

  test("lines is independent of the token stream, one entry per poem line", () => {
    const poem: Poem = {
      stanzas: [{ lines: ["One.", "Two."] }, { lines: ["Three."] }],
      syllabifications: [],
    };
    const { lines } = tokenisePoem(poem);
    expect(lines).toEqual(["One.", "Two.", "Three."]);
  });
});

describe("word-token filtering", () => {
  test("isWordToken distinguishes word from punctuation", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    expect(tokens.map(isWordToken)).toEqual([true, false, true, false]);
  });

  test("wordTokenIndices drops punctuation from a span", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    expect(wordTokenIndices(tokens, { start: 0, end: 4 })).toEqual([0, 2]);
  });

  test("wordTokens returns the word tokens themselves", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    expect(wordTokens(tokens, { start: 0, end: 4 }).map((t) => t.text)).toEqual(["Hello", "world"]);
  });

  test("a span with only punctuation yields no word tokens", () => {
    const { tokens } = tokenisePoem(poemOf("Hello, world!"));
    expect(wordTokenIndices(tokens, { start: 1, end: 2 })).toEqual([]);
  });
});

describe("tokeniseFragment", () => {
  test("tokenises standalone text the same way a poem line is tokenised", () => {
    expect(tokeniseFragment("land's edge,")).toEqual([
      { kind: "word", text: "land's" },
      { kind: "word", text: "edge" },
      { kind: "punctuation", text: "," },
    ]);
  });

  test("a whitespace run of any kind is discarded, never becomes a token", () => {
    expect(tokeniseFragment("hope,\n  It   sank")).toEqual(tokeniseFragment("hope, It sank"));
  });
});
