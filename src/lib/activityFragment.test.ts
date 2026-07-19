import { describe, expect, test } from "bun:test";
import { activityKeyFromFragment, activityKeyToFragment } from "./activityFragment";
import { ACTIVITY_KEYS } from "./session";

describe("activityKeyToFragment", () => {
  test("kebab-cases each activity key", () => {
    expect(activityKeyToFragment("readSilently")).toBe("read-silently");
    expect(activityKeyToFragment("broadDevices")).toBe("broad-devices");
    expect(activityKeyToFragment("scansion")).toBe("scansion");
    expect(activityKeyToFragment("pronouns")).toBe("pronouns");
    expect(activityKeyToFragment("sentences")).toBe("sentences");
    expect(activityKeyToFragment("glossary")).toBe("glossary");
    expect(activityKeyToFragment("devices")).toBe("devices");
    expect(activityKeyToFragment("allusions")).toBe("allusions");
    expect(activityKeyToFragment("argument")).toBe("argument");
  });
});

describe("activityKeyFromFragment", () => {
  test("round-trips every activity key through its fragment", () => {
    for (const key of ACTIVITY_KEYS) {
      expect(activityKeyFromFragment(activityKeyToFragment(key))).toBe(key);
    }
  });

  test("returns null for a fragment that names no activity", () => {
    expect(activityKeyFromFragment("not-an-activity")).toBeNull();
    expect(activityKeyFromFragment("")).toBeNull();
  });
});
