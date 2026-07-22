import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { minimalPack, type PackInput } from "./pack/fixture";
import {
  discoverPackFiles,
  type Finding,
  validateFile,
  validateFiles,
  validatePack,
} from "./validate";

const span = (exact: string) => ({ kind: "span" as const, anchor: { exact } });
const typed = (text: string) => ({ kind: "text" as const, text });

/** The first finding at an exact location, or undefined if none matches. */
function findingAt(findings: Finding[], location: string): Finding | undefined {
  return findings.find((f) => f.location === location);
}

type ScansionInput = NonNullable<PackInput["scansion"]>;

/** The fixture's own 8-syllable iambic-tetrameter line, reusable across scansion tests. */
function fixtureScansionLine(): ScansionInput["lines"][number] {
  return {
    syllables: [
      { answer: "stressed", alternates: ["unstressed"] },
      { answer: "stressed" },
      { answer: "unstressed" },
      { answer: "stressed" },
      { answer: "unstressed" },
      { answer: "stressed" },
      { answer: "unstressed" },
      { answer: "stressed" },
    ],
  };
}

function scansionWithRhyme(rhyme: number[][]): ScansionInput {
  return {
    metreName: "iambic tetrameter",
    lines: [fixtureScansionLine(), fixtureScansionLine()],
    deviations: [],
    rhyme,
    elisionQuestions: [],
  };
}

describe("validatePack—a clean pack", () => {
  test("the fixture pack produces zero findings", () => {
    expect(validatePack(minimalPack())).toEqual([]);
  });
});

describe("validatePack—schema failures stop there", () => {
  test("a wrong schema version reports only the zod issue, at its field", () => {
    const bad: unknown = { ...minimalPack(), schemaVersion: 2 };
    const findings = validatePack(bad);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe("schemaVersion");
    expect(findings[0].message.length).toBeGreaterThan(0);
  });
});

describe("validatePack—anchors", () => {
  test("an unresolved anchor is reported at its pack location", () => {
    const findings = validatePack(
      minimalPack({
        pronouns: [{ pronoun: { exact: "nope" }, antecedent: { answer: typed("x") } }],
      }),
    );
    const finding = findingAt(findings, "pronouns[0].pronoun");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("unresolved");
    expect(finding?.message).toContain("nope");
  });

  test("an ambiguous anchor is reported at its pack location", () => {
    const pack: PackInput = {
      schemaVersion: 1,
      id: "ambiguous-test",
      title: "Ambiguous Test",
      poet: "Anonymous",
      activeActivities: {
        readSilently: true,
        scansion: false,
        pronouns: true,
        sentences: false,
        glossary: false,
        devices: false,
        broadDevices: false,
        allusions: false,
        argument: false,
      },
      poem: { stanzas: [{ lines: ["The boat drifted, the boat sank."] }], syllabifications: [] },
      pronouns: [{ pronoun: { exact: "boat" }, antecedent: { answer: typed("x") } }],
    };
    const findings = validatePack(pack);
    const finding = findingAt(findings, "pronouns[0].pronoun");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("ambiguous");
  });

  test("an unresolved alternate span is reported one level below its answer key", () => {
    const findings = validatePack(
      minimalPack({
        sentences: [
          {
            anchor: { exact: "O boat, you carried all my hope," },
            subject: { answer: span("you"), alternates: [span("nowhere-to-be-found")] },
            verb: { answer: span("carried") },
            object: { kind: "present", target: { answer: span("all my hope") } },
            paraphrase: "The boat carried all the speaker's hope.",
          },
        ],
      }),
    );
    expect(findingAt(findings, "sentences[0].subject.alternates[0]")).toBeDefined();
  });
});

describe("validatePack—active-activity flags", () => {
  test("an enabled activity with no matching section is reported", () => {
    const findings = validatePack(minimalPack({ scansion: undefined }));
    const finding = findingAt(findings, "activeActivities.scansion");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("scansion");
  });

  test("a disabled activity with no section is not reported", () => {
    const findings = validatePack(
      minimalPack({ scansion: undefined, activeActivities: { scansion: false } }),
    );
    expect(findingAt(findings, "activeActivities.scansion")).toBeUndefined();
  });
});

describe("validatePack—scansion", () => {
  test("a scansion line count that disagrees with the poem is reported", () => {
    const findings = validatePack(
      minimalPack({
        scansion: {
          metreName: "iambic tetrameter",
          lines: [fixtureScansionLine()],
          deviations: [],
          rhyme: [],
          elisionQuestions: [],
        },
      }),
    );
    const finding = findingAt(findings, "scansion.lines");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("1 line(s)");
    expect(finding?.message).toContain("poem has 2");
  });

  test("a per-line syllable mismatch names the line, both counts, and a per-word breakdown", () => {
    const shortLine = fixtureScansionLine();
    shortLine.syllables = shortLine.syllables.slice(0, 7); // line now claims 7; the text still counts 8
    const findings = validatePack(
      minimalPack({
        scansion: {
          metreName: "iambic tetrameter",
          lines: [shortLine, fixtureScansionLine()],
          deviations: [],
          rhyme: [],
          elisionQuestions: [],
        },
      }),
    );
    const finding = findingAt(findings, "scansion.lines[0]");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("scans 7 syllable(s)");
    expect(finding?.message).toContain("counts 8");
    expect(finding?.message).toContain("carried(2)");
    expect(finding?.message).toContain("syllabification");
  });

  test("a syllabification that doesn't reconcatenate to the word is reported", () => {
    const findings = validatePack(
      minimalPack({
        poem: {
          stanzas: [
            { lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."] },
          ],
          syllabifications: [
            { word: { exact: "carried" }, syllables: ["car", "ryed"] },
            { word: { exact: "beneath" }, syllables: ["be", "neath"] },
          ],
        },
      }),
    );
    const finding = findingAt(findings, "poem.syllabifications[0].syllables");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("carryed");
    expect(finding?.message).toContain('"carried"');
  });

  test("an elision question inconsistent with a syllabification is reported", () => {
    const findings = validatePack(
      minimalPack({
        scansion: {
          metreName: "iambic tetrameter",
          lines: [fixtureScansionLine(), fixtureScansionLine()],
          deviations: [],
          rhyme: [],
          elisionQuestions: [
            {
              anchor: { exact: "carried" },
              prompt: "How many syllables does 'carried' carry here?",
              syllableCount: { answer: 3 },
            },
          ],
        },
      }),
    );
    const finding = findingAt(findings, "scansion.elisionQuestions[0].syllableCount");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("[3]");
    expect(finding?.message).toContain("divides the same word into 2");
  });
});

describe("validatePack—scansion requires explicit syllabification", () => {
  test("a multi-syllable word with no syllabification entry undercounts and is flagged", () => {
    // "beneath" is two syllables; drop its entry and the line counts one short.
    const findings = validatePack(
      minimalPack({
        poem: {
          stanzas: [
            { lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."] },
          ],
          syllabifications: [{ word: { exact: "carried" }, syllables: ["car", "ried"] }],
        },
      }),
    );
    const finding = findingAt(findings, "scansion.lines[1]");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("beneath(1)");
    expect(finding?.message).toContain("syllabification");
  });
});

describe("validatePack—rhyme", () => {
  test("an out-of-range rhyme index is reported", () => {
    const findings = validatePack(minimalPack({ scansion: scansionWithRhyme([[0], [5]]) }));
    const finding = findingAt(findings, "scansion.rhyme[1]");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("out of range");
  });

  test("a rhyme index appearing in two groups is reported", () => {
    const findings = validatePack(minimalPack({ scansion: scansionWithRhyme([[0, 1], [1]]) }));
    const finding = findingAt(findings, "scansion.rhyme[1]");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("scansion.rhyme[0]");
  });

  test("a non-empty partition that omits a line is reported", () => {
    const findings = validatePack(minimalPack({ scansion: scansionWithRhyme([[0]]) }));
    const finding = findingAt(findings, "scansion.rhyme");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("1");
  });
});

describe("validatePack—devices", () => {
  test("a duplicate palette id is reported", () => {
    const findings = validatePack(
      minimalPack({
        devices: {
          palette: [
            {
              id: "apostrophe",
              name: "apostrophe",
              definition: "a direct address to an absent, dead, or non-human addressee",
              canonicalExample: {
                text: "Milton! thou shouldst be living at this hour",
                source: "Wordsworth, 'London, 1802'",
              },
            },
            {
              id: "apostrophe",
              name: "apostrophe (again)",
              definition: "a duplicate id with different content",
              canonicalExample: { text: "O rose, thou art sick", source: "Blake, 'The Sick Rose'" },
            },
          ],
          instances: [
            {
              deviceId: "apostrophe",
              anchor: { exact: "O boat" },
              functionNote: "Addresses the boat.",
            },
          ],
        },
      }),
    );
    const finding = findingAt(findings, "devices.palette[1].id");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("devices.palette[0]");
  });

  test("an instance deviceId naming no palette entry is reported", () => {
    const findings = validatePack(
      minimalPack({
        devices: {
          palette: [
            {
              id: "apostrophe",
              name: "apostrophe",
              definition: "a direct address to an absent, dead, or non-human addressee",
              canonicalExample: {
                text: "Milton! thou shouldst be living at this hour",
                source: "Wordsworth, 'London, 1802'",
              },
            },
          ],
          instances: [
            {
              deviceId: "anaphora",
              anchor: { exact: "O boat" },
              functionNote: "Addresses the boat.",
            },
          ],
        },
      }),
    );
    const finding = findingAt(findings, "devices.instances[0].deviceId");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("anaphora");
  });
});

describe("validatePack—glossary", () => {
  test("two entries resolving to the same word span are reported", () => {
    const findings = validatePack(
      minimalPack({
        glossary: [
          {
            word: { exact: "waves" },
            essential: true,
            senses: ["ridges of water on the sea's surface"],
          },
          {
            word: { exact: "waves" },
            essential: false,
            senses: ["a second entry for the same word"],
          },
        ],
      }),
    );
    const finding = findingAt(findings, "glossary[1].word");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("glossary[0]");
  });
});

describe("validatePack—cross-activity", () => {
  test("an apostrophe instance with Activity 7 enabled but no broadDevices is reported", () => {
    const findings = validatePack(minimalPack({ broadDevices: undefined }));
    const finding = findingAt(findings, "broadDevices");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("apostrophe");
  });

  test("no cross-activity finding when Activity 7 is disabled", () => {
    const findings = validatePack(
      minimalPack({ broadDevices: undefined, activeActivities: { broadDevices: false } }),
    );
    expect(findingAt(findings, "broadDevices")).toBeUndefined();
  });
});

describe("validatePack—collects every finding, not just the first", () => {
  test("independent problems in one pack are all reported together", () => {
    const findings = validatePack(
      minimalPack({
        pronouns: [{ pronoun: { exact: "nope" }, antecedent: { answer: typed("x") } }],
        broadDevices: undefined,
      }),
    );
    expect(findingAt(findings, "pronouns[0].pronoun")).toBeDefined();
    expect(findingAt(findings, "broadDevices")).toBeDefined();
    expect(findingAt(findings, "activeActivities.broadDevices")).toBeDefined();
  });
});

describe("file-level helpers", () => {
  test("discoverPackFiles returns nothing for a directory that doesn't exist", async () => {
    const parent = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      expect(await discoverPackFiles(join(parent, "packs"))).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("discoverPackFiles returns nothing for an empty directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      expect(await discoverPackFiles(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("discoverPackFiles finds every *.json under a directory, recursively", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      await mkdir(join(dir, "sub"), { recursive: true });
      await writeFile(join(dir, "a.json"), "{}");
      await writeFile(join(dir, "sub", "b.json"), "{}");
      await writeFile(join(dir, "notes.txt"), "not a pack");
      const found = await discoverPackFiles(dir);
      expect(found).toHaveLength(2);
      expect(found.some((p) => p.endsWith("a.json"))).toBe(true);
      expect(found.some((p) => p.endsWith("sub/b.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("validateFile turns invalid JSON into a finding instead of throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      const path = join(dir, "broken.json");
      await writeFile(path, "{ not valid json");
      const result = await validateFile(path);
      expect(result.path).toBe(path);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].location).toBe("(file)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("validateFile validates a well-formed pack file end to end", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      const path = join(dir, "pack.json");
      await writeFile(path, JSON.stringify(minimalPack()));
      const result = await validateFile(path);
      expect(result.findings).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("validateFiles validates several explicit paths and preserves their order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prosody-validate-"));
    try {
      const goodPath = join(dir, "good.json");
      const badPath = join(dir, "bad.json");
      await writeFile(goodPath, JSON.stringify(minimalPack()));
      await writeFile(badPath, JSON.stringify({ ...minimalPack(), schemaVersion: 2 }));
      const results = await validateFiles([goodPath, badPath]);
      expect(results.map((r) => r.path)).toEqual([goodPath, badPath]);
      expect(results[0].findings).toEqual([]);
      expect(results[1].findings.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
