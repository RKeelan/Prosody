import { describe, expect, test } from "bun:test";
import type { TargetAnswer } from "./pack/common";
import { emptyPronounAnswer, withSpanResponse, withTextResponse } from "./pronounAnswer";
import {
  gradePronouns,
  gradeSpanResponse,
  outcomeIsCorrect,
  outcomeIsMiss,
  type PronounOutcome,
  pronounOutcome,
  type ReferenceAntecedent,
  resolveAntecedent,
} from "./pronounGrade";
import { tokenisePoem } from "./tokenise";

const span = (start: number, end: number) => ({ start, end });

/** A two-line poem to resolve antecedent anchors against. */
const poem = {
  stanzas: [
    { lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."] },
  ],
  syllabifications: [],
};
const tokens = tokenisePoem(poem).tokens;

describe("resolveAntecedent", () => {
  test("splits reference targets into resolved spans and texts", () => {
    const antecedent: TargetAnswer = {
      answer: { kind: "span", anchor: { exact: "boat" } },
      alternates: [{ kind: "text", text: "the addressed boat" }],
    };
    const reference = resolveAntecedent(tokens, antecedent);
    // "boat" is token 1 (O=0, boat=1).
    expect(reference.spans).toEqual([span(1, 2)]);
    expect(reference.texts).toEqual(["the addressed boat"]);
  });

  test("drops a span target whose anchor does not resolve", () => {
    const antecedent: TargetAnswer = {
      answer: { kind: "span", anchor: { exact: "submarine" } },
      alternates: [],
    };
    expect(resolveAntecedent(tokens, antecedent).spans).toEqual([]);
  });
});

describe("gradeSpanResponse", () => {
  const reference: ReferenceAntecedent = { spans: [span(2, 5)], texts: [] };

  test("exact for the same tokens, overlap for a shared token, miss for none", () => {
    expect(gradeSpanResponse(span(2, 5), reference)).toBe("exact");
    expect(gradeSpanResponse(span(4, 7), reference)).toBe("overlap");
    expect(gradeSpanResponse(span(6, 8), reference)).toBe("miss");
  });

  test("matches any reference span, canonical or alternate", () => {
    const withAlternate: ReferenceAntecedent = { spans: [span(0, 1), span(9, 12)], texts: [] };
    expect(gradeSpanResponse(span(9, 12), withAlternate)).toBe("exact");
  });
});

describe("outcome predicates", () => {
  const correct: PronounOutcome[] = ["exact", "overlap", "match"];
  const notCorrect: PronounOutcome[] = ["partial", "miss", "unanswered", "ungraded"];
  const notMiss: PronounOutcome[] = ["exact", "overlap", "match", "partial", "ungraded"];

  test("exact, overlap, and match are correct; nothing else is", () => {
    expect(correct.every(outcomeIsCorrect)).toBe(true);
    expect(notCorrect.some(outcomeIsCorrect)).toBe(false);
  });

  test("only a hard miss or an unanswered pronoun is a gate miss", () => {
    expect(outcomeIsMiss("miss")).toBe(true);
    expect(outcomeIsMiss("unanswered")).toBe(true);
    expect(notMiss.some(outcomeIsMiss)).toBe(false);
  });
});

describe("pronounOutcome", () => {
  const reference: ReferenceAntecedent = { spans: [span(2, 5)], texts: ["the boat"] };

  test("no response is unanswered", () => {
    expect(pronounOutcome(undefined, reference, undefined)).toBe("unanswered");
  });

  test("a span response auto-grades against the reference", () => {
    expect(pronounOutcome({ kind: "span", span: span(2, 5) }, reference, undefined)).toBe("exact");
  });

  test("a typed response is ungraded until a self-grade is given, then takes it", () => {
    const typed = { kind: "text", text: "the boat" } as const;
    expect(pronounOutcome(typed, reference, undefined)).toBe("ungraded");
    expect(pronounOutcome(typed, reference, "partial")).toBe("partial");
  });
});

describe("gradePronouns", () => {
  const references: ReferenceAntecedent[] = [
    { spans: [span(1, 2)], texts: [] }, // 0: span reference
    { spans: [span(2, 5)], texts: [] }, // 1: span reference
    { spans: [], texts: ["the speaker"] }, // 2: typed reference
    { spans: [span(9, 12)], texts: [] }, // 3: span reference, left unanswered
  ];

  test("counts correct span/typed answers and totals every pronoun", () => {
    let answer = emptyPronounAnswer();
    answer = withSpanResponse(answer, 0, span(1, 2)); // exact -> correct
    answer = withSpanResponse(answer, 1, span(6, 8)); // miss
    answer = withTextResponse(answer, 2, "the mourner"); // self-graded match -> correct
    // pronoun 3 left unanswered

    const grade = gradePronouns(references, answer, { 2: "match" });
    expect(grade.total).toBe(4);
    expect(grade.correct).toBe(2);
    expect(grade.results.map((r) => r.outcome)).toEqual(["exact", "miss", "match", "unanswered"]);
    expect(grade.results.map((r) => r.miss)).toEqual([false, true, false, true]);
  });

  test("a partial typed answer is neither correct nor a miss", () => {
    const answer = withTextResponse(emptyPronounAnswer(), 2, "someone");
    const grade = gradePronouns(references, answer, { 2: "partial" });
    expect(grade.results[2]).toEqual({ outcome: "partial", correct: false, miss: false });
  });

  test("an ungraded typed answer awaits self-assessment, off the miss list", () => {
    const answer = withTextResponse(emptyPronounAnswer(), 2, "someone");
    const grade = gradePronouns(references, answer, {});
    expect(grade.results[2]).toEqual({ outcome: "ungraded", correct: false, miss: false });
  });
});
