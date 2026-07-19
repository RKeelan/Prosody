import { describe, expect, test } from "bun:test";
import { type AnchorMatch, resolveAnchor } from "./anchor";
import type { Poem, QuoteAnchor } from "./pack";
import { parsedMinimalPack } from "./pack/fixture";
import { tokenisePoem } from "./tokenise";

/** "The boat drifted, the boat sank."—"boat" occurs twice, for disambiguation tests. */
const twoBoatsPoem: Poem = {
  stanzas: [{ lines: ["The boat drifted, the boat sank."] }],
  syllabifications: [],
};
const twoBoatsTokens = tokenisePoem(twoBoatsPoem).tokens;

describe("unique-match resolution", () => {
  test("an exact quote that occurs once resolves without disambiguation", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "drifted" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.span).toEqual({ start: 2, end: 3 });
      expect(twoBoatsTokens[result.span.start].text).toBe("drifted");
    }
  });

  test("the resolved span covers punctuation inside the quote too", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "drifted, the" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(twoBoatsTokens.slice(result.span.start, result.span.end).map((t) => t.text)).toEqual([
        "drifted",
        ",",
        "the",
      ]);
    }
  });
});

describe("disambiguation", () => {
  test("by prefix", () => {
    // "The boat" (capital "The") only precedes the first "boat".
    const result = resolveAnchor(twoBoatsTokens, { exact: "boat", prefix: "The" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.span).toEqual({ start: 1, end: 2 });
  });

  test("by suffix", () => {
    // Only the second "boat" is immediately followed by "sank".
    const result = resolveAnchor(twoBoatsTokens, { exact: "boat", suffix: "sank" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.span).toEqual({ start: 5, end: 6 });
  });

  test("by occurrence", () => {
    const first = resolveAnchor(twoBoatsTokens, { exact: "boat", occurrence: 1 });
    const second = resolveAnchor(twoBoatsTokens, { exact: "boat", occurrence: 2 });
    expect(first).toMatchObject({ status: "resolved", span: { start: 1, end: 2 } });
    expect(second).toMatchObject({ status: "resolved", span: { start: 5, end: 6 } });
  });
});

describe("unresolvable anchors", () => {
  test("exact text that is non-empty but tokenises to nothing (e.g. pure whitespace) is unresolved", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "   " });
    expect(result.status).toBe("unresolved");
    if (result.status === "unresolved") expect(result.detail).toContain("no tokens");
  });

  test("text absent from the poem reports what was searched for", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "ocean" });
    expect(result.status).toBe("unresolved");
    if (result.status === "unresolved") {
      expect(result.anchor.exact).toBe("ocean");
      expect(result.detail).toContain("ocean");
    }
  });

  test("an occurrence index past the last match is unresolved, not a crash", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "boat", occurrence: 5 });
    expect(result.status).toBe("unresolved");
    if (result.status === "unresolved") expect(result.detail).toContain("only 2");
  });

  test("a prefix/suffix that matches no occurrence is unresolved", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "boat", prefix: "A" });
    expect(result.status).toBe("unresolved");
    if (result.status === "unresolved") expect(result.detail).toContain("prefix/suffix");
  });
});

describe("ambiguous anchors", () => {
  test("multiple matches with no disambiguation report count and context", () => {
    const result = resolveAnchor(twoBoatsTokens, { exact: "boat" });
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.matches).toHaveLength(2);
      expect(result.detail).toContain("2");
      const lines = result.matches.map((m: AnchorMatch) => m.lineIndex);
      expect(lines).toEqual([0, 0]);
      for (const match of result.matches) {
        expect(match.context).toContain("[");
        expect(match.context).toContain("]");
      }
    }
  });
});

describe("anchors spanning structure", () => {
  test("an anchor spanning a line break resolves, whitespace normalised to a single space", () => {
    const poem: Poem = {
      stanzas: [
        { lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."] },
      ],
      syllabifications: [],
    };
    const tokens = tokenisePoem(poem).tokens;
    const result = resolveAnchor(tokens, { exact: "hope, It sank" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(tokens.slice(result.span.start, result.span.end).map((t) => t.text)).toEqual([
        "hope",
        ",",
        "It",
        "sank",
      ]);
      // The span crosses the line boundary.
      expect(tokens[result.span.start].lineIndex).toBe(0);
      expect(tokens[result.span.end - 1].lineIndex).toBe(1);
    }
  });

  test("an anchor spanning a stanza break resolves", () => {
    const poem: Poem = {
      stanzas: [
        { lines: ["First stanza line one,", "first stanza line two."] },
        { lines: ["Second stanza line one,", "second stanza line two."] },
      ],
      syllabifications: [],
    };
    const tokens = tokenisePoem(poem).tokens;
    const result = resolveAnchor(tokens, { exact: "two. Second stanza" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(tokens.slice(result.span.start, result.span.end).map((t) => t.text)).toEqual([
        "two",
        ".",
        "Second",
        "stanza",
      ]);
      expect(tokens[result.span.start].stanzaIndex).toBe(0);
      expect(tokens[result.span.end - 1].stanzaIndex).toBe(1);
    }
  });
});

describe("every anchor in the fixture pack resolves", () => {
  const pack = parsedMinimalPack();
  const tokens = tokenisePoem(pack.poem).tokens;

  function expectResolved(anchor: QuoteAnchor, label: string) {
    const result = resolveAnchor(tokens, anchor);
    if (result.status !== "resolved") {
      throw new Error(
        `expected ${label} to resolve, got ${result.status}: ${JSON.stringify(result)}`,
      );
    }
  }

  test("poem syllabifications", () => {
    for (const s of pack.poem.syllabifications)
      expectResolved(s.word, `syllabification "${s.word.exact}"`);
  });

  test("scansion deviations and elision questions", () => {
    for (const d of pack.scansion?.deviations ?? [])
      expectResolved(d.anchor, `deviation "${d.anchor.exact}"`);
    for (const q of pack.scansion?.elisionQuestions ?? []) {
      expectResolved(q.anchor, `elision question "${q.anchor.exact}"`);
    }
  });

  test("pronoun chips and their span antecedents", () => {
    for (const p of pack.pronouns ?? []) {
      expectResolved(p.pronoun, `pronoun "${p.pronoun.exact}"`);
      if (p.antecedent.answer.kind === "span") {
        expectResolved(p.antecedent.answer.anchor, "antecedent answer span");
      }
      for (const alt of p.antecedent.alternates) {
        if (alt.kind === "span") expectResolved(alt.anchor, "antecedent alternate span");
      }
    }
  });

  test("sentence anchors, their span parts, and gnarly clause anchors", () => {
    for (const s of pack.sentences ?? []) {
      expectResolved(s.anchor, `sentence "${s.anchor.exact}"`);
      if (s.subject.answer.kind === "span") expectResolved(s.subject.answer.anchor, "subject span");
      if (s.verb.answer.kind === "span") expectResolved(s.verb.answer.anchor, "verb span");
      if (s.object.kind === "present" && s.object.target.answer.kind === "span") {
        expectResolved(s.object.target.answer.anchor, "object span");
      }
      const walkClauses = (node: NonNullable<typeof s.gnarly>) => {
        if (node.anchor) expectResolved(node.anchor, `gnarly clause "${node.label}"`);
        for (const child of node.children ?? []) walkClauses(child);
      };
      if (s.gnarly) walkClauses(s.gnarly);
    }
  });

  test("glossary, device, and allusion anchors", () => {
    for (const g of pack.glossary ?? []) expectResolved(g.word, `glossary "${g.word.exact}"`);
    for (const inst of pack.devices?.instances ?? []) {
      expectResolved(inst.anchor, `device instance "${inst.anchor.exact}"`);
    }
    for (const a of pack.allusions ?? []) expectResolved(a.anchor, `allusion "${a.anchor.exact}"`);
  });
});
