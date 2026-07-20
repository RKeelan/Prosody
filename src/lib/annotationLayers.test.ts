import { describe, expect, test } from "bun:test";
import {
  ANNOTATION_LAYERS,
  buildLayerIndex,
  countMarksByKind,
  findMarkForSpan,
  layerFor,
  marksOverlappingSpan,
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

describe("finding a mark by exact span", () => {
  const marks = [mark("a", "stumbled", 2, 5), mark("b", "odd-word", 2, 5)];

  test("matches on kind and span together", () => {
    expect(findMarkForSpan(marks, "stumbled", { start: 2, end: 5 })?.id).toBe("a");
    expect(findMarkForSpan(marks, "odd-word", { start: 2, end: 5 })?.id).toBe("b");
  });

  test("a span that merely overlaps is not a match", () => {
    expect(findMarkForSpan(marks, "stumbled", { start: 2, end: 4 })).toBeUndefined();
    expect(findMarkForSpan(marks, "stumbled", { start: 1, end: 5 })).toBeUndefined();
  });

  test("an unmarked kind has no match", () => {
    expect(findMarkForSpan(marks, "lost-thread", { start: 2, end: 5 })).toBeUndefined();
  });

  test("a dismissed mark does not match, so its span can be marked afresh", () => {
    const dismissed = [mark("a", "stumbled", 2, 5, "dismissed")];
    expect(findMarkForSpan(dismissed, "stumbled", { start: 2, end: 5 })).toBeUndefined();
  });
});

describe("marks overlapping a span", () => {
  const marks = [
    mark("a", "stumbled", 0, 3),
    mark("b", "odd-word", 2, 6),
    mark("c", "lost-thread", 10, 12),
    mark("d", "stumbled", 1, 2, "dismissed"),
  ];

  test("returns every live mark sharing a token, in mark order", () => {
    expect(marksOverlappingSpan(marks, { start: 2, end: 3 }).map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("a mark touching only at the boundary does not overlap", () => {
    expect(marksOverlappingSpan(marks, { start: 6, end: 8 })).toEqual([]);
  });

  test("dismissed marks are never offered", () => {
    expect(marksOverlappingSpan(marks, { start: 1, end: 2 }).map((m) => m.id)).toEqual(["a"]);
  });

  test("a span over bare poem touches nothing", () => {
    expect(marksOverlappingSpan(marks, { start: 20, end: 25 })).toEqual([]);
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
