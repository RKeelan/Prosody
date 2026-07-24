import { describe, expect, test } from "bun:test";
import {
  ANNOTATION_LAYERS,
  buildLayerIndex,
  countMarksByKind,
  layerFor,
  layerHighlight,
  marksInReadingOrder,
} from "./annotationLayers";
import { type Mark, MarkKind } from "./session/model";

function mark(id: string, kind: Mark["kind"], start: number, end: number, status?: Mark["status"]) {
  return { id, kind, span: { start, end }, status: status ?? ("open" as const) };
}

const ALL_KINDS = new Set(MarkKind.options);

describe("the layer table", () => {
  test("covers every mark kind exactly once", () => {
    expect(ANNOTATION_LAYERS.map((l) => l.kind).sort()).toEqual([...MarkKind.options].sort());
  });

  test("looks up each kind's layer", () => {
    for (const kind of MarkKind.options) {
      expect(layerFor(kind).kind).toBe(kind);
    }
  });

  test("gives each layer its own colour", () => {
    const tints = new Set(ANNOTATION_LAYERS.map((l) => l.tokenClassName));
    expect(tints.size).toBe(ANNOTATION_LAYERS.length);
    const underlines = new Set(ANNOTATION_LAYERS.map((l) => l.underlineColor));
    expect(underlines.size).toBe(ANNOTATION_LAYERS.length);
  });
});

describe("the per-token index", () => {
  test("maps every token of a mark's span to that mark's kind", () => {
    const index = buildLayerIndex([mark("a", "stumbled", 2, 5)], ALL_KINDS);
    expect([...index.keys()].sort((x, y) => x - y)).toEqual([2, 3, 4]);
    expect(index.get(3)).toEqual(["stumbled"]);
  });

  test("hidden layers contribute nothing", () => {
    const marks = [mark("a", "stumbled", 0, 2), mark("b", "odd-word", 0, 2)];
    const index = buildLayerIndex(marks, new Set(["odd-word" as const]));
    expect(index.get(0)).toEqual(["odd-word"]);
  });

  test("an empty visible set yields an empty index", () => {
    expect(buildLayerIndex([mark("a", "stumbled", 0, 3)], new Set()).size).toBe(0);
  });

  test("overlapping layers list kinds in layer-table order, whatever the mark order", () => {
    const marks = [mark("a", "odd-word", 1, 3), mark("b", "stumbled", 0, 3)];
    const index = buildLayerIndex(marks, ALL_KINDS);
    expect(index.get(1)).toEqual(["stumbled", "odd-word"]);
  });

  test("two marks of one kind over the same token list it once", () => {
    const marks = [mark("a", "stumbled", 0, 3), mark("b", "stumbled", 2, 4)];
    expect(buildLayerIndex(marks, ALL_KINDS).get(2)).toEqual(["stumbled"]);
  });

  test("resolved marks still show; dismissed ones do not", () => {
    const marks = [
      mark("a", "stumbled", 0, 1, "resolved"),
      mark("b", "lost-thread", 1, 2, "dismissed"),
    ];
    const index = buildLayerIndex(marks, ALL_KINDS);
    expect(index.get(0)).toEqual(["stumbled"]);
    expect(index.has(1)).toBe(false);
  });
});

describe("token highlight", () => {
  test("no covering layers means no tint", () => {
    expect(layerHighlight([])).toBeUndefined();
  });

  test("a single layer tints the background and underlines nothing", () => {
    expect(layerHighlight(["stumbled"])).toEqual({
      key: "stumbled",
      className: layerFor("stumbled").tokenClassName,
      boxShadow: undefined,
    });
  });

  test("the top layer paints the background, whatever else covers the token", () => {
    const tint = layerHighlight(["lost-thread", "odd-word"]);
    expect(tint?.className).toBe(layerFor("lost-thread").tokenClassName);
    expect(tint?.className).not.toBe(layerFor("odd-word").tokenClassName);
  });

  test("each lower layer adds a strip in its own colour, stacked upward", () => {
    const tint = layerHighlight(["stumbled", "lost-thread", "odd-word"]);
    expect(tint?.key).toBe("stumbled|lost-thread|odd-word");
    expect(tint?.boxShadow).toBe(
      `inset 0 -3px 0 0 ${layerFor("lost-thread").underlineColor}, ` +
        `inset 0 -6px 0 0 ${layerFor("odd-word").underlineColor}`,
    );
  });

  test("the background layer never underlines itself", () => {
    const tint = layerHighlight(["lost-thread", "odd-word"]);
    expect(tint?.boxShadow).toBe(`inset 0 -3px 0 0 ${layerFor("odd-word").underlineColor}`);
    expect(tint?.boxShadow).not.toContain(layerFor("lost-thread").underlineColor);
  });
});

describe("reading order", () => {
  test("orders by where each mark starts, not when it was made", () => {
    const marks = [mark("c", "stumbled", 9, 11), mark("a", "odd-word", 1, 2)];
    expect(marksInReadingOrder(marks).map((m) => m.id)).toEqual(["a", "c"]);
  });

  test("marks starting together put the shorter first", () => {
    const marks = [mark("long", "stumbled", 4, 9), mark("short", "odd-word", 4, 5)];
    expect(marksInReadingOrder(marks).map((m) => m.id)).toEqual(["short", "long"]);
  });

  test("resolved marks are listed; dismissed ones are not", () => {
    const marks = [
      mark("a", "stumbled", 0, 1, "resolved"),
      mark("b", "lost-thread", 1, 2, "dismissed"),
    ];
    expect(marksInReadingOrder(marks).map((m) => m.id)).toEqual(["a"]);
  });

  test("leaves the caller's list untouched", () => {
    const marks = [mark("c", "stumbled", 9, 11), mark("a", "odd-word", 1, 2)];
    marksInReadingOrder(marks);
    expect(marks.map((m) => m.id)).toEqual(["c", "a"]);
  });

  test("an empty list orders to nothing", () => {
    expect(marksInReadingOrder([])).toEqual([]);
  });
});

describe("mark counts", () => {
  test("counts each kind, dismissed marks excluded", () => {
    const marks = [
      mark("a", "stumbled", 0, 1),
      mark("b", "stumbled", 4, 5, "resolved"),
      mark("c", "odd-word", 6, 7),
      mark("d", "lost-thread", 8, 9, "dismissed"),
    ];
    expect(countMarksByKind(marks)).toEqual({ stumbled: 2, "lost-thread": 0, "odd-word": 1 });
  });

  test("an empty list counts zero of everything", () => {
    expect(countMarksByKind([])).toEqual({ stumbled: 0, "lost-thread": 0, "odd-word": 0 });
  });
});
