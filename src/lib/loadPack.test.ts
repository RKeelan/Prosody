import { describe, expect, test } from "bun:test";
import { loadPackFromText } from "./loadPack";
import { minimalPack } from "./pack/fixture";
import { contentHash } from "./session";

describe("loadPackFromText", () => {
  test("a valid pack loads with its content hash", () => {
    const text = JSON.stringify(minimalPack());
    const result = loadPackFromText(text);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pack.id).toBe("the-lost-boat");
    expect(result.rawText).toBe(text);
    expect(result.contentHash).toBe(contentHash(text));
  });

  test("broken JSON reports a single (file) finding", () => {
    const result = loadPackFromText("{not json");
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location).toBe("(file)");
    expect(result.findings[0].message).toContain("not valid JSON");
  });

  test("a schema-invalid pack reports findings at the offending field", () => {
    // Missing "poet" entirely—a required field the schema, not the validator, enforces.
    const broken = minimalPack() as Record<string, unknown>;
    delete broken.poet;
    const result = loadPackFromText(JSON.stringify(broken));
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.findings.some((f) => f.location === "poet")).toBe(true);
  });

  test("a consistency-failing pack reports the validator's finding", () => {
    // An anchor that cannot resolve against the poem text.
    const broken = minimalPack({
      pronouns: [
        {
          pronoun: { exact: "nonexistent-word" },
          antecedent: { answer: { kind: "text", text: "x" } },
        },
      ],
    });
    const result = loadPackFromText(JSON.stringify(broken));
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.findings.some((f) => f.message.includes("unresolved"))).toBe(true);
  });

  test("does not throw on non-string, non-object JSON", () => {
    const result = loadPackFromText("42");
    expect(result.status).toBe("error");
  });
});
