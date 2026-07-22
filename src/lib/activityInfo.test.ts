import { describe, expect, test } from "bun:test";
import { ACTIVITIES, activityInfo, adjacentActivity, enabledActivities } from "./activityInfo";
import { ActiveActivities } from "./pack/metadata";
import { ACTIVITY_KEYS } from "./session";

const allOn = ActiveActivities.parse({});

describe("ACTIVITIES", () => {
  test("covers every activity key, in order, exactly once", () => {
    expect(ACTIVITIES.map((a) => a.key)).toEqual([...ACTIVITY_KEYS]);
  });

  test("numbers 1 through 9 in order", () => {
    expect(ACTIVITIES.map((a) => a.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("every entry has a non-empty title and a plan task in Stage 3 (9-17)", () => {
    for (const info of ACTIVITIES) {
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.planTask).toBeGreaterThanOrEqual(9);
      expect(info.planTask).toBeLessThanOrEqual(17);
    }
  });

  test("plan task numbers are strictly increasing with activity number", () => {
    for (let i = 1; i < ACTIVITIES.length; i++) {
      expect(ACTIVITIES[i].planTask).toBeGreaterThan(ACTIVITIES[i - 1].planTask);
    }
  });
});

describe("activityInfo", () => {
  test("looks up every activity key", () => {
    for (const key of ACTIVITY_KEYS) {
      expect(activityInfo(key).key).toBe(key);
    }
  });
});

describe("enabledActivities", () => {
  test("returns all nine, in order, when every flag is on", () => {
    expect(enabledActivities(allOn).map((a) => a.key)).toEqual([...ACTIVITY_KEYS]);
  });

  test("drops the activities the pack switches off, keeping order", () => {
    const some = ActiveActivities.parse({ scansion: false, glossary: false });
    expect(enabledActivities(some).map((a) => a.number)).toEqual([1, 3, 4, 6, 7, 8, 9]);
  });
});

describe("adjacentActivity", () => {
  test("steps forward and back through the enabled sequence", () => {
    expect(adjacentActivity(allOn, "pronouns", 1)).toBe("sentences");
    expect(adjacentActivity(allOn, "pronouns", -1)).toBe("scansion");
  });

  test("returns null past the first and last enabled activity", () => {
    expect(adjacentActivity(allOn, "readSilently", -1)).toBeNull();
    expect(adjacentActivity(allOn, "argument", 1)).toBeNull();
  });

  test("steps over a disabled activity rather than landing on it", () => {
    const noScansion = ActiveActivities.parse({ scansion: false });
    expect(adjacentActivity(noScansion, "readSilently", 1)).toBe("pronouns");
    expect(adjacentActivity(noScansion, "pronouns", -1)).toBe("readSilently");
  });
});
