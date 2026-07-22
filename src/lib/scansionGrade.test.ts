import { describe, expect, test } from "bun:test";
import type { ScansionLine, Stress } from "./pack/scansion";
import type { ScansionAnswer } from "./scansionAnswer";
import {
  gradeRhyme,
  gradeStress,
  isStressAccepted,
  type ReferenceWord,
  referenceWords,
  stressAgreement,
} from "./scansionGrade";
import type { LineSyllables } from "./syllables";

/** A stress answer key with an optional list of accepted alternates. */
function key(answer: Stress, alternates: Stress[] = []) {
  return { answer, alternates };
}

/** A learner answer over a single word, no rhyme. */
function wordAnswer(
  tokenIndex: number,
  breaks: number[],
  stress: (Stress | null)[],
): ScansionAnswer {
  return { words: { [tokenIndex]: { breaks, stress } }, rhyme: [] };
}

describe("isStressAccepted", () => {
  test("the canonical answer and any listed alternate are accepted", () => {
    expect(isStressAccepted(key("stressed"), "stressed")).toBe(true);
    expect(isStressAccepted(key("stressed", ["unstressed"]), "unstressed")).toBe(true);
    expect(isStressAccepted(key("stressed"), "unstressed")).toBe(false);
  });
});

describe("referenceWords", () => {
  test("carries each word's syllables, implied breaks, and sliced stress answers", () => {
    const lineSyllables: LineSyllables[] = [
      {
        lineIndex: 0,
        syllableCount: 3,
        words: [
          {
            tokenIndex: 0,
            span: { start: 0, end: 1 },
            text: "I",
            syllables: ["I"],
            fromSyllabification: false,
            syllableStart: 0,
          },
          {
            tokenIndex: 1,
            span: { start: 1, end: 2 },
            text: "traveller",
            syllables: ["trav", "eller"],
            fromSyllabification: true,
            syllableStart: 1,
          },
        ],
      },
    ];
    const scansionLines: ScansionLine[] = [
      { syllables: [key("unstressed"), key("stressed"), key("unstressed")] },
    ];
    const refs = referenceWords(lineSyllables, scansionLines);
    expect(refs.map((r) => r.text)).toEqual(["I", "traveller"]);
    expect(refs[1].breaks).toEqual([4]); // "trav" is four letters
    expect(refs[1].stress).toEqual([key("stressed"), key("unstressed")]);
  });
});

describe("gradeStress", () => {
  const traveller: ReferenceWord = {
    tokenIndex: 1,
    text: "traveller",
    syllables: ["trav", "eller"],
    breaks: [4],
    stress: [key("stressed"), key("unstressed")],
  };

  test("right division and right stress score every syllable correct", () => {
    const grade = gradeStress([traveller], wordAnswer(1, [4], ["stressed", "unstressed"]));
    expect(grade.total).toBe(2);
    expect(grade.correct).toBe(2);
    expect(grade.words[0]).toEqual({
      tokenIndex: 1,
      splitCorrect: true,
      cells: ["correct", "correct"],
    });
    expect(stressAgreement(grade)).toBe(100);
  });

  test("a wrong division scores every syllable a mismatch, whatever the stress", () => {
    // learner breaks at 5 ("trave"|"ller"), not 4.
    const grade = gradeStress([traveller], wordAnswer(1, [5], ["stressed", "unstressed"]));
    expect(grade.words[0].splitCorrect).toBe(false);
    expect(grade.words[0].cells).toEqual(["mismatch", "mismatch"]);
    expect(grade.correct).toBe(0);
  });

  test("an undivided word that should split is all mismatch", () => {
    // learner never touched the word: default single syllable, breaks [].
    const grade = gradeStress([traveller], { words: {}, rhyme: [] });
    expect(grade.words[0].splitCorrect).toBe(false);
    expect(grade.correct).toBe(0);
  });

  test("right division but a wrong stress mark is a mismatch on that syllable", () => {
    const grade = gradeStress([traveller], wordAnswer(1, [4], ["unstressed", "unstressed"]));
    expect(grade.words[0].cells).toEqual(["mismatch", "correct"]);
    expect(grade.correct).toBe(1);
  });

  test("an alternate reading is accepted", () => {
    const spondee: ReferenceWord = {
      tokenIndex: 2,
      text: "Two",
      syllables: ["Two"],
      breaks: [],
      stress: [key("stressed", ["unstressed"])],
    };
    const grade = gradeStress([spondee], wordAnswer(2, [], ["unstressed"]));
    expect(grade.words[0].cells).toEqual(["correct"]);
  });

  test("a right division left unmarked reads as unmarked, not a mismatch", () => {
    const grade = gradeStress([traveller], wordAnswer(1, [4], [null, "unstressed"]));
    expect(grade.words[0].cells).toEqual(["unmarked", "correct"]);
    expect(grade.correct).toBe(1);
  });

  test("agreement is zero when there is nothing to grade", () => {
    expect(stressAgreement(gradeStress([], { words: {}, rhyme: [] }))).toBe(0);
  });
});

describe("gradeRhyme", () => {
  test("the same partition under different letters is fully correct", () => {
    const reference = [
      [0, 2],
      [1, 3],
    ];
    const grade = gradeRhyme(reference, ["B", "A", "B", "A"], 4);
    expect(grade.matches).toBe(true);
    expect(grade.lineCorrect).toEqual([true, true, true, true]);
  });

  test("a mis-grouped pair fails only the lines involved", () => {
    const reference = [
      [0, 1],
      [2, 3],
    ];
    const grade = gradeRhyme(reference, ["A", "A", "B", null], 4);
    expect(grade.matches).toBe(false);
    expect(grade.lineCorrect).toEqual([true, true, false, false]);
  });

  test("an unassigned line is its own group, not grouped with other blanks", () => {
    const reference = [
      [0, 1],
      [2, 3],
    ];
    const grade = gradeRhyme(reference, [null, null, null, null], 4);
    expect(grade.matches).toBe(false);
    expect(grade.lineCorrect).toEqual([false, false, false, false]);
  });

  test("referenceGroupOf reports each line's reference group for colour-coding", () => {
    const reference = [
      [0, 2],
      [1, 3],
    ];
    const grade = gradeRhyme(reference, ["A", "A", "A", "A"], 4);
    expect(grade.referenceGroupOf).toEqual([0, 1, 0, 1]);
  });
});
