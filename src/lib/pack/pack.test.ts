import { describe, expect, test } from "bun:test";
import { minimalPack, type PackInput, parsedMinimalPack } from "./fixture";
import { Pack } from "./index";

/** Parse an input expected to fail, returning the issue paths for assertion. */
function issuePaths(input: unknown): PropertyKey[][] {
  const result = Pack.safeParse(input);
  if (result.success) {
    throw new Error("expected parse to fail, but it succeeded");
  }
  return result.error.issues.map((issue) => issue.path);
}

describe("Pack schema—valid packs", () => {
  test("the minimal fixture pack parses", () => {
    expect(Pack.safeParse(minimalPack()).success).toBe(true);
  });

  test("a pack with only metadata and poem parses, filling defaults", () => {
    const bare: PackInput = {
      schemaVersion: 1,
      id: "bare",
      title: "Bare",
      poet: "Anonymous",
      poem: { stanzas: [{ lines: ["A single unadorned line."] }] },
    };
    const result = Pack.safeParse(bare);
    expect(result.success).toBe(true);
    if (result.success) {
      // Every active-activity flag defaults to true.
      expect(result.data.activeActivities.scansion).toBe(true);
      expect(result.data.activeActivities.argument).toBe(true);
      // Optional sections stay absent; poem syllabifications default to empty.
      expect(result.data.scansion).toBeUndefined();
      expect(result.data.poem.syllabifications).toEqual([]);
    }
  });

  test("alternates default to an empty list where none are given", () => {
    const pack = parsedMinimalPack();
    // The "It" pronoun records no alternates, so the answer key fills [].
    expect(pack.pronouns?.[1].antecedent.alternates).toEqual([]);
  });

  test("a partial active-activities object fills the rest with true", () => {
    const pack = parsedMinimalPack({ activeActivities: { scansion: false } });
    expect(pack.activeActivities.scansion).toBe(false);
    expect(pack.activeActivities.pronouns).toBe(true);
  });

  test("the clause tree parses recursively", () => {
    const pack = parsedMinimalPack();
    expect(pack.sentences?.[0].gnarly?.children?.[1].children?.[0].label).toBe("verb: carried");
  });
});

describe("Pack schema—invalid packs point at the offending field", () => {
  test("a wrong schema version is rejected", () => {
    const bad: unknown = { ...minimalPack(), schemaVersion: 2 };
    expect(issuePaths(bad)).toContainEqual(["schemaVersion"]);
  });

  test("an id that is not a slug is rejected", () => {
    expect(issuePaths(minimalPack({ id: "Not A Slug" }))).toContainEqual(["id"]);
  });

  test("an empty stanza list is rejected", () => {
    const bad = minimalPack({ poem: { stanzas: [], syllabifications: [] } });
    expect(issuePaths(bad)).toContainEqual(["poem", "stanzas"]);
  });

  test("an empty quote anchor is rejected at the anchor's field", () => {
    const bad = minimalPack({
      pronouns: [{ pronoun: { exact: "" }, antecedent: { answer: { kind: "text", text: "x" } } }],
    });
    expect(issuePaths(bad)).toContainEqual(["pronouns", 0, "pronoun", "exact"]);
  });

  test("an anchor mixing occurrence with prefix/suffix is rejected", () => {
    const bad = minimalPack({
      pronouns: [
        {
          pronoun: { exact: "boat", prefix: "O ", occurrence: 1 },
          antecedent: { answer: { kind: "text", text: "x" } },
        },
      ],
    });
    expect(issuePaths(bad)).toContainEqual(["pronouns", 0, "pronoun", "occurrence"]);
  });

  test("an odd-usage word with only one sense is rejected at senses", () => {
    const bad = minimalPack({
      glossary: [{ word: { exact: "waves" }, oddUsage: true, senses: ["a single sense"] }],
    });
    expect(issuePaths(bad)).toContainEqual(["glossary", 0, "senses"]);
  });

  test("a multi-line paraphrase is rejected", () => {
    const bad = minimalPack({
      sentences: [
        {
          anchor: { exact: "A single unadorned line." },
          subject: { answer: { kind: "text", text: "s" } },
          verb: { answer: { kind: "text", text: "v" } },
          object: { kind: "none" },
          paraphrase: "first line\nsecond line",
        },
      ],
    });
    expect(issuePaths(bad)).toContainEqual(["sentences", 0, "paraphrase"]);
  });

  test("a negative rhyme line index is rejected", () => {
    const bad = minimalPack({
      scansion: {
        metreName: "iambic tetrameter",
        lines: [{ syllables: [{ answer: "stressed" }] }],
        rhyme: [[-1]],
      },
    });
    expect(issuePaths(bad)).toContainEqual(["scansion", "rhyme", 0, 0]);
  });
});
