import { describe, expect, test } from "bun:test";
import { loadPackFromText } from "./loadPack";
import { SAMPLE_PACK_TEXT } from "./samplePack";

describe("SAMPLE_PACK_TEXT", () => {
  test("loads clean through the same pipeline a picked file would use", () => {
    const result = loadPackFromText(SAMPLE_PACK_TEXT);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pack.id).toBe("ozymandias");
  });
});
