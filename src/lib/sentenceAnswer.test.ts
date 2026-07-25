import { describe, expect, test } from "bun:test";
import {
  answeredParts,
  answeredSentenceCount,
  clearObject,
  clearPart,
  coerceSentenceAnswer,
  emptySentenceAnswer,
  isSentenceAnswered,
  responseFor,
  setObjectNone,
  setObjectSpan,
  setObjectText,
  setParaphrase,
  setPartSpan,
  setPartText,
} from "./sentenceAnswer";

const span = (start: number, end: number) => ({ start, end });

/** Answer every part of one sentence, for the "answered" helpers. */
function fullyAnswered() {
  let answer = emptySentenceAnswer();
  answer = setPartSpan(answer, 0, "subject", span(0, 1));
  answer = setPartSpan(answer, 0, "verb", span(1, 2));
  answer = setObjectNone(answer, 0);
  answer = setParaphrase(answer, 0, "The traveller spoke.");
  return answer;
}

describe("part builders", () => {
  test("a span answer records the tapped span", () => {
    const answer = setPartSpan(emptySentenceAnswer(), 2, "subject", span(3, 6));
    expect(responseFor(answer, 2).subject).toEqual({ kind: "span", span: span(3, 6) });
  });

  test("a typed answer is trimmed", () => {
    const answer = setPartText(emptySentenceAnswer(), 0, "verb", "  is  ");
    expect(responseFor(answer, 0).verb).toEqual({ kind: "text", text: "is" });
  });

  test("empty typed text clears the slot instead of recording it", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", span(0, 1));
    answer = setPartText(answer, 0, "subject", "   ");
    expect(responseFor(answer, 0).subject).toBeUndefined();
  });

  test("clearing the last part prunes the sentence entry", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", span(0, 1));
    answer = clearPart(answer, 0, "subject");
    expect(answer.sentences[0]).toBeUndefined();
  });

  test("a later answer replaces an earlier one for the same slot", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", span(0, 1));
    answer = setPartText(answer, 0, "subject", "(implied) the speaker");
    expect(responseFor(answer, 0).subject).toEqual({ kind: "text", text: "(implied) the speaker" });
  });
});

describe("object slot", () => {
  test("no object is a first-class recorded answer", () => {
    const answer = setObjectNone(emptySentenceAnswer(), 1);
    expect(responseFor(answer, 1).object).toEqual({ kind: "none" });
  });

  test("a span object and a typed object both record", () => {
    let answer = setObjectSpan(emptySentenceAnswer(), 0, span(4, 8));
    expect(responseFor(answer, 0).object).toEqual({ kind: "span", span: span(4, 8) });
    answer = setObjectText(answer, 0, "the crown");
    expect(responseFor(answer, 0).object).toEqual({ kind: "text", text: "the crown" });
  });

  test("clearing the object leaves it unanswered", () => {
    let answer = setObjectNone(emptySentenceAnswer(), 0);
    answer = clearObject(answer, 0);
    expect(responseFor(answer, 0).object).toBeUndefined();
  });
});

describe("paraphrase", () => {
  test("a paraphrase is trimmed; blank clears it", () => {
    let answer = setParaphrase(emptySentenceAnswer(), 0, "  Two legs stand.  ");
    expect(responseFor(answer, 0).paraphrase).toBe("Two legs stand.");
    answer = setParaphrase(answer, 0, "   ");
    expect(responseFor(answer, 0).paraphrase).toBeUndefined();
  });
});

describe("answered helpers", () => {
  test("answeredParts counts the filled slots", () => {
    let answer = setPartSpan(emptySentenceAnswer(), 0, "subject", span(0, 1));
    answer = setObjectNone(answer, 0);
    expect(answeredParts(responseFor(answer, 0))).toBe(2);
  });

  test("a sentence is answered only when all four parts are filled", () => {
    const partial = setPartSpan(emptySentenceAnswer(), 0, "subject", span(0, 1));
    expect(isSentenceAnswered(responseFor(partial, 0))).toBe(false);
    expect(isSentenceAnswered(responseFor(fullyAnswered(), 0))).toBe(true);
  });

  test("answeredSentenceCount counts only fully answered sentences", () => {
    let answer = fullyAnswered();
    answer = setPartSpan(answer, 1, "subject", span(0, 1));
    expect(answeredSentenceCount(answer)).toBe(1);
  });
});

describe("coerceSentenceAnswer", () => {
  test("round-trips a well-formed answer", () => {
    const answer = fullyAnswered();
    const round = coerceSentenceAnswer(JSON.parse(JSON.stringify(answer)), 3);
    expect(round).toEqual(answer);
  });

  test("drops responses for sentences outside the count", () => {
    const answer = setPartSpan(emptySentenceAnswer(), 5, "subject", span(0, 1));
    expect(coerceSentenceAnswer(answer, 3).sentences[5]).toBeUndefined();
  });

  test("drops malformed spans, empty text, and unknown object kinds", () => {
    const raw = {
      sentences: {
        0: {
          subject: { kind: "span", span: { start: 2, end: 1 } }, // inverted
          verb: { kind: "text", text: "   " }, // blank
          object: { kind: "bogus" }, // unknown
          paraphrase: "  ",
        },
      },
    };
    expect(coerceSentenceAnswer(raw, 1).sentences[0]).toBeUndefined();
  });

  test("keeps a valid no-object answer through coercion", () => {
    const raw = { sentences: { 0: { object: { kind: "none" } } } };
    expect(coerceSentenceAnswer(raw, 1).sentences[0]).toEqual({ object: { kind: "none" } });
  });

  test("garbage input coerces to an empty answer", () => {
    expect(coerceSentenceAnswer(null, 2)).toEqual(emptySentenceAnswer());
    expect(coerceSentenceAnswer({ sentences: 42 }, 2)).toEqual(emptySentenceAnswer());
  });
});
