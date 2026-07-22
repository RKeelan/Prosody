/**
 * Annotation layers: the Activity 1 marks as a coloured, toggleable overlay on
 * the poem.
 *
 * Vision.md makes the marks an output of Activity 1 that stays visible—as a
 * layer the learner can switch on and off—in every later activity. The marks
 * themselves persist in the session store; which layers are currently showing
 * is transient view state the renderer holds (see the note in
 * `./session/model`). This module owns what sits between them: one layer per
 * mark kind, its colour, and the pure projection from a mark list to a
 * per-token lookup the renderer can consult in constant time.
 */

import { sameSpan, spansOverlap, type TokenSpan } from "./grade";
import type { Mark, MarkKind } from "./session/model";

/** One annotation layer: a mark kind, how to label it, and how to colour it. */
export interface AnnotationLayer {
  readonly kind: MarkKind;
  /** Short label for the layer toggle and the marker menu. */
  readonly label: string;
  /** Tailwind classes tinting a marked token in the poem. */
  readonly tokenClassName: string;
  /** Tailwind classes for the toggle's colour swatch. */
  readonly swatchClassName: string;
}

/**
 * The three layers, in priority order: where a token carries marks from more
 * than one layer, the first listed here supplies its tint (the renderer can
 * only paint one background). Toggling the others off isolates them, which is
 * what the toggles are for.
 *
 * $Claude Distinct hues rather than the theme's neutral chart palette—three
 * layers over running verse have to be told apart at a glance on a phone, and
 * the tints must stay light enough to read poem text through.
 */
export const ANNOTATION_LAYERS: readonly AnnotationLayer[] = [
  {
    kind: "stumbled",
    label: "Stumbled",
    tokenClassName: "bg-amber-200/80 dark:bg-amber-400/30",
    swatchClassName: "bg-amber-300 dark:bg-amber-400/60",
  },
  {
    kind: "lost-thread",
    label: "Lost the thread",
    tokenClassName: "bg-sky-200/80 dark:bg-sky-400/30",
    swatchClassName: "bg-sky-300 dark:bg-sky-400/60",
  },
  {
    kind: "odd-word",
    label: "Odd word",
    tokenClassName: "bg-violet-200/80 dark:bg-violet-400/30",
    swatchClassName: "bg-violet-300 dark:bg-violet-400/60",
  },
];

// A Record, not a Map: MarkKind is a closed union, so lookup needs no runtime
// undefined check (as in `./activityInfo`).
const BY_KIND = Object.fromEntries(ANNOTATION_LAYERS.map((l) => [l.kind, l])) as Record<
  MarkKind,
  AnnotationLayer
>;

/** Look up one layer by mark kind. Every {@link MarkKind} has a layer. */
export function layerFor(kind: MarkKind): AnnotationLayer {
  return BY_KIND[kind];
}

/**
 * Which visible layers cover each token, keyed by token index. Kinds within an
 * entry follow {@link ANNOTATION_LAYERS} order, so the renderer takes the first
 * as the token's tint and gets the same answer every render.
 *
 * $Claude Dismissed marks are left out. A dismissed mark was consciously set
 * aside at the Activity 9 gate, so keeping it on the poem re-raises something
 * the learner already closed; resolved marks stay, because "here is where I
 * stumbled, and here is what fixed it" is the record the later activities are
 * meant to show.
 */
export function buildLayerIndex(
  marks: readonly Mark[],
  visible: ReadonlySet<MarkKind>,
): Map<number, MarkKind[]> {
  const index = new Map<number, MarkKind[]>();
  for (const layer of ANNOTATION_LAYERS) {
    if (!visible.has(layer.kind)) continue;
    for (const mark of marks) {
      if (mark.kind !== layer.kind || mark.status === "dismissed") continue;
      for (let i = mark.span.start; i < mark.span.end; i++) {
        const existing = index.get(i);
        if (existing) {
          if (!existing.includes(layer.kind)) existing.push(layer.kind);
        } else {
          index.set(i, [layer.kind]);
        }
      }
    }
  }
  return index;
}

/**
 * The live mark of `kind` covering exactly `span`, if there is one. The marker
 * controls use this to read as a toggle: where a span is already marked, the
 * button un-marks it instead of stacking a second identical mark on top.
 */
export function findMarkForSpan(
  marks: readonly Mark[],
  kind: MarkKind,
  span: TokenSpan,
): Mark | undefined {
  return marks.find((m) => m.kind === kind && m.status !== "dismissed" && sameSpan(m.span, span));
}

/**
 * Every live mark sharing at least one token with `span`, in mark order.
 *
 * This is what makes a mark clearable in practice: un-marking by exact span
 * means reproducing the original selection tap for tap, so the marker bar also
 * lists whatever the current selection merely touches and offers to remove it.
 */
export function marksOverlappingSpan(marks: readonly Mark[], span: TokenSpan): Mark[] {
  return marks.filter((m) => m.status !== "dismissed" && spansOverlap(m.span, span));
}

/**
 * The live marks in reading order: earliest span first, and where two marks
 * start together the shorter one first. Activity 1's mark list renders this, so
 * the list runs down the poem the way the poem does rather than in the order the
 * learner happened to mark things.
 *
 * Dismissed marks are left out, matching {@link buildLayerIndex}: a mark set
 * aside at the gate is gone from the poem, and a chip that still offered to
 * remove it would act on something the learner cannot see.
 */
export function marksInReadingOrder(marks: readonly Mark[]): Mark[] {
  return marks
    .filter((m) => m.status !== "dismissed")
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
}

/** How many marks of each kind the list holds, dismissed ones excluded. */
export function countMarksByKind(marks: readonly Mark[]): Record<MarkKind, number> {
  const counts = { stumbled: 0, "lost-thread": 0, "odd-word": 0 } satisfies Record<
    MarkKind,
    number
  >;
  for (const mark of marks) {
    if (mark.status !== "dismissed") counts[mark.kind]++;
  }
  return counts;
}
