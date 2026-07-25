import { describe, expect, test } from "bun:test";
import type { Sentence } from "./pack";
import {
  emptySentenceAnswer,
  setObjectNone,
  setObjectSpan,
  setObjectText,
  setParaphrase,
  setPartSpan,
  setPartText,
} from "./sentenceAnswer";
import {
  gradeSentence,
  gradeSentences,
  gradeSpan,
  objectOutcome,
  outcomeIsCorrect,
  outcomeIsMiss,
  type PartOutcome,
  partOutcome,
  type ReferenceSentence,
  resolveSentence,
  resolveTarget,
  type SelfGrade,
  selfGradeKey,
} from "./sentenceGrade";
import { tokenisePoem } from "./tokenise";

const span = (start: number, end: number) => ({ start, end });

/** One line whose parts have unique quote anchors, so references resolve cleanly. */
const poem = {
  stanzas: [{ lines: ["I met a traveller from an antique land."] }],
  syllabifications: [],
};
const tokens = tokenisePoem(poem).tokens;

/** A transitive sentence: subject "I", verb "met", object the traveller phrase. */
const transitive: Sentence = {
  anchor: { exact: "I met a traveller from an antique land" },
  subject: { answer: { kind: "span", anchor: { exact: "I" } }, alternates: [] },
  verb: { answer: { kind: "span", anchor: { exact: "met" } }, alternates: [] },
  object: {
    kind: "present",
    target: {
      answer: { kind: "span", anchor: { exact: "a traveller from an antique land" } },
      alternates: [],
    },
  },
  paraphrase: "The speaker met a traveller.",
};

/** An intransitive sentence sharing the poem: subject "traveller", verb "met", no object. */
const intransitive: Sentence = {
  anchor: { exact: "a traveller" },
  subject: { answer: { kind: "span", anchor: { exact: "traveller" } }, alternates: [] },
  verb: { answer: { kind: "span", anchor: { exact: "met" } }, alternates: [] },
  object: { kind: "none" },
  paraphrase: "A traveller was met.",
};

const noSelf = (): SelfGrade | undefined => undefined;

describe("resolveTarget and resolveSentence", () => {
  test("splits a target into resolved spans and typed texts", () => {
    const resolved = resolveTarget(tokens, {
      answer: { kind: "span", anchor: { exact: "met" } },
      alternates: [{ kind: "text", text: "encountered" }],
    });
    // "I"=0, "met"=1.
    expect(resolved.spans).toEqual([span(1, 2)]);
    expect(resolved.texts).toEqual(["encountered"]);
  });

  test("resolves an intransitive sentence's object to a none reference", () => {
    expect(resolveSentence(tokens, intransitive).object).toEqual({ kind: "none" });
  });
});

describe("gradeSpan", () => {
  const reference = { spans: [span(2, 5)], texts: [] };
  test("exact, overlap, miss", () => {
    expect(gradeSpan(span(2, 5), reference)).toBe("exact");
    expect(gradeSpan(span(4, 7), reference)).toBe("overlap");
    expect(gradeSpan(span(6, 8), reference)).toBe("miss");
  });
});

describe("partOutcome", () => {
  const reference = { spans: [span(1, 2)], texts: [] };
  test("a span auto-grades; a typed answer takes its self-grade or waits", () => {
    expect(partOutcome({ kind: "span", span: span(1, 2) }, reference, undefined)).toBe("exact");
    expect(partOutcome({ kind: "text", text: "met" }, reference, "match")).toBe("match");
    expect(partOutcome({ kind: "text", text: "met" }, reference, undefined)).toBe("ungraded");
    expect(partOutcome(undefined, reference, undefined)).toBe("unanswered");
  });
});

describe("objectOutcome", () => {
  test("against a none record: only 'no object' is right", () => {
    const reference = { kind: "none" } as const;
    expect(objectOutcome({ kind: "none" }, reference, undefined)).toBe("exact");
    expect(objectOutcome({ kind: "span", span: span(0, 1) }, reference, undefined)).toBe("miss");
    expect(objectOutcome(undefined, reference, undefined)).toBe("unanswered");
  });

  test("against a present record: 'no object' misses, a span auto-grades", () => {
    const reference = { kind: "present", target: { spans: [span(2, 8)], texts: [] } } as const;
    expect(objectOutcome({ kind: "none" }, reference, undefined)).toBe("miss");
    expect(objectOutcome({ kind: "span", span: span(2, 8) }, reference, undefined)).toBe("exact");
    expect(objectOutcome({ kind: "text", text: "the traveller" }, reference, "partial")).toBe(
      "partial",
    );
  });
});

describe("outcome predicates", () => {
  test("correct counts exact/overlap/match; miss counts miss/unanswered", () => {
    const correct: PartOutcome[] = ["exact", "overlap", "match"];
    const notCorrect: PartOutcome[] = ["partial", "ungraded", "miss", "unanswered"];
    const misses: PartOutcome[] = ["miss", "unanswered"];
    const notMiss: PartOutcome[] = ["partial", "ungraded", "exact"];
    expect(correct.every(outcomeIsCorrect)).toBe(true);
    expect(notCorrect.some(outcomeIsCorrect)).toBe(false);
    expect(misses.every(outcomeIsMiss)).toBe(true);
    expect(notMiss.some(outcomeIsMiss)).toBe(false);
  });
});

describe("gradeSentence", () => {
  const reference = resolveSentence(tokens, transitive);
  const subjectSpan = resolveTarget(tokens, transitive.subject).spans[0];
  const verbSpan = resolveTarget(tokens, transitive.verb).spans[0];
  const objectSpan = resolveTarget(
    tokens,
    transitive.object.kind === "present" ? transitive.object.target : transitive.subject,
  ).spans[0];

  test("clears only when all four parts pass", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", subjectSpan);
    answer = setPartSpan(answer, 0, "verb", verbSpan);
    answer = setObjectSpan(answer, 0, objectSpan);
    answer = setParaphrase(answer, 0, "The speaker met a traveller.");
    // The paraphrase is self-graded: ungraded until judged, so not yet cleared.
    const ungraded = gradeSentence(reference, answer.sentences[0], noSelf);
    expect(ungraded.paraphrase).toBe("ungraded");
    expect(ungraded.cleared).toBe(false);
    // Self-grade the paraphrase a match: now all four pass.
    const cleared = gradeSentence(reference, answer.sentences[0], (slot) =>
      slot === "paraphrase" ? "match" : undefined,
    );
    expect(cleared.cleared).toBe(true);
    expect(cleared.misses).toEqual([]);
  });

  test("a wrong span and a blank paraphrase both land on the miss list", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", span(6, 8)); // wrong
    answer = setPartSpan(answer, 0, "verb", verbSpan);
    answer = setObjectSpan(answer, 0, objectSpan);
    // paraphrase left blank
    const result = gradeSentence(reference, answer.sentences[0], noSelf);
    expect(result.subject).toBe("miss");
    expect(result.paraphrase).toBe("unanswered");
    expect(result.misses.map((m) => m.slot).sort()).toEqual(["paraphrase", "subject"]);
    expect(result.cleared).toBe(false);
  });

  test("a typed part self-graded a miss counts as a miss, partial does not", () => {
    const answer = setPartText(emptySentenceAnswer(), 0, "subject", "the narrator");
    const asMiss = gradeSentence(reference, answer.sentences[0], (slot) =>
      slot === "subject" ? "miss" : undefined,
    );
    expect(asMiss.misses.some((m) => m.slot === "subject")).toBe(true);
    const asPartial = gradeSentence(reference, answer.sentences[0], (slot) =>
      slot === "subject" ? "partial" : undefined,
    );
    expect(asPartial.misses.some((m) => m.slot === "subject")).toBe(false);
    expect(asPartial.cleared).toBe(false);
  });
});

describe("gradeSentences", () => {
  const references: ReferenceSentence[] = [
    resolveSentence(tokens, transitive),
    resolveSentence(tokens, intransitive),
  ];

  test("counts cleared sentences and keys self-grades by sentence and slot", () => {
    const subjectSpan = resolveTarget(tokens, intransitive.subject).spans[0];
    const verbSpan = resolveTarget(tokens, intransitive.verb).spans[0];
    let answer = setPartSpan(emptySentenceAnswer(), 1, "subject", subjectSpan);
    answer = setPartSpan(answer, 1, "verb", verbSpan);
    answer = setObjectNone(answer, 1);
    answer = setParaphrase(answer, 1, "A traveller was met.");
    const grade = gradeSentences(references, answer, { [selfGradeKey(1, "paraphrase")]: "match" });
    expect(grade.total).toBe(2);
    expect(grade.cleared).toBe(1);
    expect(grade.results[1].cleared).toBe(true);
    expect(grade.results[0].cleared).toBe(false);
  });

  test("a typed object self-grade keyed to the wrong sentence does not leak", () => {
    const answer = setObjectText(emptySentenceAnswer(), 0, "the traveller");
    // Self-grade keyed to sentence 1, not 0: sentence 0's object stays ungraded.
    const grade = gradeSentences(references, answer, { [selfGradeKey(1, "object")]: "match" });
    expect(grade.results[0].object).toBe("ungraded");
  });
});
