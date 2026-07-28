import { describe, expect, test } from "bun:test";
import {
  addTag,
  coerceDeviceAnswer,
  type DeviceTag,
  emptyDeviceAnswer,
  removeTag,
  setTagNote,
  tagById,
  tagCount,
} from "./deviceAnswer";

const tag = (id: string, deviceId: string, start: number, end: number, note = ""): DeviceTag => ({
  id,
  deviceId,
  span: { start, end },
  note,
});

describe("emptyDeviceAnswer", () => {
  test("starts with no tags", () => {
    expect(tagCount(emptyDeviceAnswer())).toBe(0);
  });
});

describe("addTag and removeTag", () => {
  test("adds a tag, preserving order", () => {
    let answer = addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3));
    answer = addTag(answer, tag("b", "apostrophe", 5, 7));
    expect(answer.tags.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("removes a tag by id", () => {
    const answer = addTag(
      addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3)),
      tag("b", "apostrophe", 5, 7),
    );
    expect(removeTag(answer, "a").tags.map((t) => t.id)).toEqual(["b"]);
  });

  test("removing an absent id is a no-op returning the same reference", () => {
    const answer = addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3));
    expect(removeTag(answer, "z")).toBe(answer);
  });
});

describe("setTagNote", () => {
  test("sets a tag's note without touching its span or device", () => {
    const answer = addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3));
    const next = setTagNote(answer, "a", "the boast now reads as its opposite");
    expect(tagById(next, "a")).toEqual({
      id: "a",
      deviceId: "irony",
      span: { start: 0, end: 3 },
      note: "the boast now reads as its opposite",
    });
  });

  test("stores the note as written, keeping trailing whitespace mid-edit", () => {
    const answer = addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3));
    expect(tagById(setTagNote(answer, "a", "cold "), "a")?.note).toBe("cold ");
  });

  test("setting the note of an absent id is a no-op returning the same reference", () => {
    const answer = addTag(emptyDeviceAnswer(), tag("a", "irony", 0, 3));
    expect(setTagNote(answer, "z", "x")).toBe(answer);
  });
});

describe("coerceDeviceAnswer", () => {
  test("keeps well-formed tags and defaults a missing note to empty", () => {
    const raw = { tags: [{ id: "a", deviceId: "irony", span: { start: 0, end: 3 } }] };
    expect(coerceDeviceAnswer(raw, 10).tags).toEqual([
      { id: "a", deviceId: "irony", span: { start: 0, end: 3 }, note: "" },
    ]);
  });

  test("drops a tag with an out-of-range or inverted span", () => {
    const raw = {
      tags: [
        { id: "a", deviceId: "irony", span: { start: 0, end: 11 } }, // past the poem
        { id: "b", deviceId: "irony", span: { start: 4, end: 4 } }, // empty
        { id: "c", deviceId: "irony", span: { start: 2, end: 5 } }, // valid
      ],
    };
    expect(coerceDeviceAnswer(raw, 10).tags.map((t) => t.id)).toEqual(["c"]);
  });

  test("drops a tag with a missing or empty deviceId", () => {
    const raw = {
      tags: [
        { id: "a", deviceId: "", span: { start: 0, end: 3 } },
        { id: "b", span: { start: 0, end: 3 } },
      ],
    };
    expect(coerceDeviceAnswer(raw, 10).tags).toEqual([]);
  });

  test("gives a tag with no stored id a positional fallback", () => {
    const raw = { tags: [{ deviceId: "irony", span: { start: 0, end: 3 } }] };
    expect(coerceDeviceAnswer(raw, 10).tags[0].id).toBe("restored-0");
  });

  test("keeps fallback ids distinct so every tag stays addressable", () => {
    const raw = {
      tags: [
        { deviceId: "irony", span: { start: 0, end: 3 } },
        { id: "restored-0", deviceId: "apostrophe", span: { start: 4, end: 6 } },
      ],
    };
    const ids = coerceDeviceAnswer(raw, 10).tags.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("tolerates junk—non-array tags, missing field, non-object entries", () => {
    expect(coerceDeviceAnswer(undefined, 10).tags).toEqual([]);
    expect(coerceDeviceAnswer({ tags: "nope" }, 10).tags).toEqual([]);
    expect(coerceDeviceAnswer({ tags: [null, 3] }, 10).tags).toEqual([]);
  });
});
