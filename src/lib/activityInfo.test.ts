import { describe, expect, test } from "bun:test";
import { ACTIVITIES, activityInfo } from "./activityInfo";
import { ACTIVITY_KEYS } from "./session";

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
