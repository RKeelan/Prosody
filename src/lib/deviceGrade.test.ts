import { describe, expect, test } from "bun:test";
import { type DeviceTag, emptyDeviceAnswer } from "./deviceAnswer";
import { matchDevices, type ReferenceDevice, resolveDevice } from "./deviceGrade";
import type { DeviceInstance } from "./pack";
import { tokenisePoem } from "./tokenise";

const instance = (deviceId: string, exact: string, functionNote = "note"): DeviceInstance => ({
  deviceId,
  anchor: { exact },
  functionNote,
});

/** A two-line poem to resolve device anchors against. */
const poem = {
  stanzas: [
    { lines: ["Boundless and bare the lone level sands,", "Cold command and cruel sneer."] },
  ],
  syllabifications: [],
};
const tokens = tokenisePoem(poem).tokens;

const tag = (
  id: string,
  deviceId: string,
  span: { start: number; end: number },
  note = "",
): DeviceTag => ({
  id,
  deviceId,
  span,
  note,
});

/** The token span of an anchor, for building a learner tag that lands on it. */
function spanOf(exact: string): { start: number; end: number } {
  const ref = resolveDevice(tokens, instance("x", exact));
  if (!ref.span) throw new Error(`"${exact}" did not resolve`);
  return ref.span;
}

describe("resolveDevice", () => {
  test("resolves an instance to its span and carries its function note", () => {
    const ref = resolveDevice(
      tokens,
      instance("alliteration", "Boundless and bare", "the b's bind"),
    );
    expect(ref.span).not.toBeNull();
    expect(ref.deviceId).toBe("alliteration");
    expect(ref.functionNote).toBe("the b's bind");
  });

  test("keeps no span when the anchor is not in the poem", () => {
    expect(resolveDevice(tokens, instance("irony", "Ozymandias, King of Kings")).span).toBeNull();
  });
});

describe("matchDevices", () => {
  const references: ReferenceDevice[] = [
    resolveDevice(tokens, instance("alliteration", "Boundless and bare")),
    resolveDevice(tokens, instance("alliteration", "lone level")),
    resolveDevice(tokens, instance("alliteration", "Cold command")),
  ];

  test("an empty hunt finds nothing and raises no false positive", () => {
    const grade = matchDevices(references, emptyDeviceAnswer().tags);
    expect(grade).toEqual({
      total: 3,
      found: 0,
      references: [{ found: false }, { found: false }, { found: false }],
      falsePositives: [],
    });
  });

  test("credits a tag that overlaps a reference of the same device", () => {
    // A span clipped to just "bare" still overlaps the "Boundless and bare" instance.
    const bare = spanOf("bare");
    const grade = matchDevices(references, [tag("a", "alliteration", bare)]);
    expect(grade.found).toBe(1);
    expect(grade.references[0]).toEqual({ found: true, tagId: "a" });
    expect(grade.falsePositives).toEqual([]);
  });

  test("a right span but the wrong device is a false positive, not a find", () => {
    const grade = matchDevices(references, [tag("a", "irony", spanOf("Boundless and bare"))]);
    expect(grade.found).toBe(0);
    expect(grade.references[0].found).toBe(false);
    expect(grade.falsePositives).toEqual(["a"]);
  });

  test("a tag matching nothing in the poem is a false positive", () => {
    const grade = matchDevices(references, [tag("a", "alliteration", spanOf("the lone"))]);
    // "the lone" overlaps the "lone level" instance—so this one IS found; use a
    // span that touches no alliteration instead.
    expect(grade.found).toBe(1);
    const miss = matchDevices(references, [tag("b", "alliteration", spanOf("sands"))]);
    expect(miss.found).toBe(0);
    expect(miss.falsePositives).toEqual(["b"]);
  });

  test("two tags over one spot count once; the surplus is a false positive", () => {
    const span = spanOf("Boundless and bare");
    const grade = matchDevices(references, [
      tag("a", "alliteration", span),
      tag("b", "alliteration", span),
    ]);
    expect(grade.found).toBe(1);
    expect(grade.references[0]).toEqual({ found: true, tagId: "a" });
    expect(grade.falsePositives).toEqual(["b"]);
  });

  test("finds every instance when each is tagged", () => {
    const grade = matchDevices(references, [
      tag("a", "alliteration", spanOf("Boundless and bare")),
      tag("b", "alliteration", spanOf("lone level")),
      tag("c", "alliteration", spanOf("Cold command")),
    ]);
    expect(grade.found).toBe(3);
    expect(grade.references.map((r) => r.found)).toEqual([true, true, true]);
    expect(grade.falsePositives).toEqual([]);
  });

  test("a reference whose anchor does not resolve can never be found", () => {
    const broken = [resolveDevice(tokens, instance("irony", "not in this poem"))];
    const grade = matchDevices(broken, [tag("a", "irony", { start: 0, end: 2 })]);
    expect(grade.total).toBe(1);
    expect(grade.found).toBe(0);
    expect(grade.references[0].found).toBe(false);
    expect(grade.falsePositives).toEqual(["a"]);
  });
});
