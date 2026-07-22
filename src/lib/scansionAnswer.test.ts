import { describe, expect, test } from "bun:test";
import {
  coerceScansionAnswer,
  cycleSegmentStress,
  emptyScansionAnswer,
  type ScansionAnswer,
  segmentsOf,
  splitFor,
  toggleBreak,
  toggleRhyme,
  wordProgress,
} from "./scansionAnswer";

describe("segmentsOf", () => {
  test("splits a word at its break positions", () => {
    expect(segmentsOf("traveller", [4, 6])).toEqual(["trav", "el", "ler"]);
  });

  test("no breaks leaves the word whole", () => {
    expect(segmentsOf("stone", [])).toEqual(["stone"]);
  });

  test("sorts breaks before splitting", () => {
    expect(segmentsOf("Ozymandias", [6, 1, 3])).toEqual(["O", "zy", "man", "dias"]);
  });
});

describe("splitFor and emptyScansionAnswer", () => {
  test("an untouched word reads as one whole, unmarked syllable", () => {
    const answer = emptyScansionAnswer(2);
    expect(splitFor(answer, 5)).toEqual({ breaks: [], stress: [null] });
    expect(answer.rhyme).toEqual([null, null]);
  });
});

describe("toggleBreak", () => {
  test("adds a break and grows the stress array to match, blank", () => {
    const answer = toggleBreak(emptyScansionAnswer(1), 3, 4);
    expect(answer.words[3]).toEqual({ breaks: [4], stress: [null, null] });
  });

  test("removing a break shrinks the syllables back", () => {
    let answer = toggleBreak(emptyScansionAnswer(1), 3, 4);
    answer = toggleBreak(answer, 3, 6); // breaks [4,6], three syllables
    expect(answer.words[3].breaks).toEqual([4, 6]);
    answer = toggleBreak(answer, 3, 4); // remove first break
    expect(answer.words[3].breaks).toEqual([6]);
    expect(answer.words[3].stress).toEqual([null, null]);
  });

  test("changing a division blanks the word's stress marks", () => {
    let answer = toggleBreak(emptyScansionAnswer(1), 3, 4);
    answer = cycleSegmentStress(answer, 3, 0); // mark first syllable
    expect(answer.words[3].stress[0]).toBe("stressed");
    answer = toggleBreak(answer, 3, 6); // re-divide
    expect(answer.words[3].stress).toEqual([null, null, null]);
  });
});

describe("cycleSegmentStress", () => {
  test("cycles a syllable unmarked → stressed → unstressed → unmarked", () => {
    let answer = emptyScansionAnswer(1);
    answer = cycleSegmentStress(answer, 7, 0);
    expect(splitFor(answer, 7).stress[0]).toBe("stressed");
    answer = cycleSegmentStress(answer, 7, 0);
    expect(splitFor(answer, 7).stress[0]).toBe("unstressed");
    answer = cycleSegmentStress(answer, 7, 0);
    expect(splitFor(answer, 7).stress[0]).toBe(null);
  });

  test("an out-of-range segment is a no-op returning the same reference", () => {
    const answer = emptyScansionAnswer(1);
    expect(cycleSegmentStress(answer, 7, 3)).toBe(answer);
  });
});

describe("toggleRhyme", () => {
  test("assigns a letter, and clears it when the same letter is toggled again", () => {
    let answer = emptyScansionAnswer(2);
    answer = toggleRhyme(answer, 1, "B");
    expect(answer.rhyme).toEqual([null, "B"]);
    answer = toggleRhyme(answer, 1, "B");
    expect(answer.rhyme).toEqual([null, null]);
  });

  test("a different letter replaces the current one", () => {
    let answer = toggleRhyme(emptyScansionAnswer(1), 0, "A");
    answer = toggleRhyme(answer, 0, "C");
    expect(answer.rhyme[0]).toBe("C");
  });
});

describe("coerceScansionAnswer", () => {
  const lengths = new Map([
    [3, 9],
    [7, 5],
  ]);

  test("undefined loads as a blank answer at the current size", () => {
    expect(coerceScansionAnswer(undefined, lengths, 2)).toEqual(emptyScansionAnswer(2));
  });

  test("keeps valid word splits, drops out-of-range breaks and unknown words", () => {
    const raw = {
      words: {
        3: { breaks: [4, 6, 99], stress: ["stressed", "banana", null] },
        7: { breaks: [2], stress: ["unstressed", "unstressed"] },
        42: { breaks: [1], stress: ["stressed"] }, // token 42 is not a word here
      },
      rhyme: ["A", 7],
    };
    const answer = coerceScansionAnswer(raw, lengths, 2);
    // 99 is out of [1,8], dropped; the malformed stress becomes null.
    expect(answer.words[3]).toEqual({ breaks: [4, 6], stress: ["stressed", null, null] });
    expect(answer.words[7]).toEqual({ breaks: [2], stress: ["unstressed", "unstressed"] });
    expect(answer.words[42]).toBeUndefined();
    expect(answer.rhyme).toEqual(["A", null]);
  });

  test("an untouched word is not stored", () => {
    const raw = { words: { 3: { breaks: [], stress: [null] } }, rhyme: [] };
    const answer = coerceScansionAnswer(raw, lengths, 1);
    expect(answer.words[3]).toBeUndefined();
  });
});

describe("wordProgress", () => {
  test("counts words with at least one stress mark against the total", () => {
    let answer: ScansionAnswer = emptyScansionAnswer(2);
    expect(wordProgress(answer, 10)).toEqual({ marked: 0, total: 10 });
    answer = cycleSegmentStress(answer, 3, 0);
    answer = toggleBreak(answer, 7, 2); // split but not yet stressed
    expect(wordProgress(answer, 10)).toEqual({ marked: 1, total: 10 });
  });
});
