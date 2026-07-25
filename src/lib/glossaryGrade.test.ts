import { describe, expect, test } from "bun:test";
import { emptyGlossaryAnswer, setPrimarySense } from "./glossaryAnswer";
import {
  gradeLoadedWords,
  type LoadedOutcome,
  type LoadedWord,
  loadedOutcome,
  outcomeIsCorrect,
  outcomeIsMiss,
  resolveLoadedWord,
  wordAnswered,
} from "./glossaryGrade";
import type { GlossaryEntry } from "./pack";
import { tokenisePoem } from "./tokenise";

const loaded = (word: string, senses: string[]): GlossaryEntry => ({
  word: { exact: word },
  essential: false,
  oddUsage: true,
  senses,
});

/** A two-line poem to resolve glossary anchors against. */
const poem = {
  stanzas: [
    { lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."] },
  ],
  syllabifications: [],
};
const tokens = tokenisePoem(poem).tokens;

/** The token index of a resolved loaded word, for glossing it in a test. */
function tokenOf(word: LoadedWord): number {
  const span = word.spans[0];
  if (!span) throw new Error("word did not resolve");
  return span.start;
}

describe("resolveLoadedWord", () => {
  test("resolves a word to its span and carries its two senses", () => {
    const word = resolveLoadedWord(tokens, loaded("carried", ["transported", "bore up"]));
    expect(word.spans).toHaveLength(1);
    expect(word.senses).toEqual(["transported", "bore up"]);
  });

  test("keeps no span when the word is not in the poem", () => {
    expect(resolveLoadedWord(tokens, loaded("submarine", ["a", "b"])).spans).toEqual([]);
  });
});

describe("wordAnswered", () => {
  const word = resolveLoadedWord(tokens, loaded("carried", ["transported", "bore up"]));

  test("true once the learner writes a sense for the word", () => {
    const answer = setPrimarySense(emptyGlossaryAnswer(), tokenOf(word), "transported");
    expect(wordAnswered(answer, word)).toBe(true);
  });

  test("false when the learner has written nothing there", () => {
    expect(wordAnswered(emptyGlossaryAnswer(), word)).toBe(false);
  });
});

describe("loadedOutcome and predicates", () => {
  test("unanswered until addressed, then ungraded until self-graded", () => {
    expect(loadedOutcome(false, undefined)).toBe("unanswered");
    expect(loadedOutcome(true, undefined)).toBe("ungraded");
    expect(loadedOutcome(true, "partial")).toBe("partial");
  });

  test("only a match is correct", () => {
    expect(outcomeIsCorrect("match")).toBe(true);
    const notMatch: LoadedOutcome[] = ["unanswered", "ungraded", "partial", "miss"];
    expect(notMatch.some(outcomeIsCorrect)).toBe(false);
  });

  test("a hard miss or an unaddressed word is a miss; nothing else is", () => {
    expect(outcomeIsMiss("miss")).toBe(true);
    expect(outcomeIsMiss("unanswered")).toBe(true);
    const notMiss: LoadedOutcome[] = ["match", "partial", "ungraded"];
    expect(notMiss.some(outcomeIsMiss)).toBe(false);
  });
});

describe("gradeLoadedWords", () => {
  const references = [
    resolveLoadedWord(tokens, loaded("carried", ["transported", "bore up"])),
    resolveLoadedWord(tokens, loaded("waves", ["sea ridges", "gestures"])),
    resolveLoadedWord(tokens, loaded("hope", ["a wish", "a person named Hope"])),
  ];

  test("counts matches and totals every loaded word", () => {
    let answer = emptyGlossaryAnswer();
    answer = setPrimarySense(answer, tokenOf(references[0]), "transported"); // match
    answer = setPrimarySense(answer, tokenOf(references[1]), "sea ridges"); // partial
    // hope left unaddressed

    const grade = gradeLoadedWords(references, answer, { 0: "match", 1: "partial" });
    expect(grade.total).toBe(3);
    expect(grade.correct).toBe(1);
    expect(grade.results.map((r) => r.outcome)).toEqual(["match", "partial", "unanswered"]);
    expect(grade.results.map((r) => r.miss)).toEqual([false, false, true]);
  });

  test("an addressed word awaiting self-assessment is neither correct nor a miss", () => {
    const answer = setPrimarySense(emptyGlossaryAnswer(), tokenOf(references[0]), "transported");
    const grade = gradeLoadedWords(references, answer, {});
    expect(grade.results[0]).toEqual({ outcome: "ungraded", correct: false, miss: false });
  });
});
