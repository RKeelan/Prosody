/**
 * A harness around {@link PoemView}: form a span by tapping, mark it, and
 * toggle the annotation layers on and off.
 *
 * $Claude Task 8 builds the renderer, not an activity, so it has no screen of
 * its own to be tested on—yet the plan's Richard-tests flow needs one. This
 * component is that surface: the smallest wrapper that exercises every part of
 * the renderer end to end, standing in for each activity until Stage 3 replaces
 * them one by one. The marker controls preview Activity 1 (Task 9), which
 * inherits them; the layer toggles are the real thing, and belong to whichever
 * activity is on screen.
 *
 * Selection and layer visibility live here as React state, deliberately. Both
 * are view state, not study progress: what persists is the marks themselves
 * (see the note in `@/lib/session/model`).
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { PoemView } from "@/components/PoemView";
import { Button } from "@/components/ui/button";
import {
  ANNOTATION_LAYERS,
  buildLayerIndex,
  countMarksByKind,
  findMarkForSpan,
  layerFor,
  marksOverlappingSpan,
} from "@/lib/annotationLayers";
import type { TokenSpan } from "@/lib/grade";
import {
  clearSelection,
  EMPTY_SELECTION,
  type Selection,
  selectionSpan,
  selectionText,
  spanText,
  tapToken,
} from "@/lib/selection";
import type { MarkKind, SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface PoemWorkbenchProps {
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

const ALL_KINDS = ANNOTATION_LAYERS.map((layer) => layer.kind);

export function PoemWorkbench({ tokenised, store }: PoemWorkbenchProps) {
  const marks = useStore(store, (s) => s.session.currentAttempt.marks);
  const actions = useStore(store, (s) => s.actions);

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [visible, setVisible] = useState<ReadonlySet<MarkKind>>(() => new Set(ALL_KINDS));

  const layerIndex = useMemo(() => buildLayerIndex(marks, visible), [marks, visible]);
  const counts = useMemo(() => countMarksByKind(marks), [marks]);
  const quoted = selectionText(selection, tokenised.lines, tokenised.tokens);
  const quoteOf = (span: TokenSpan) => spanText(span, tokenised.lines, tokenised.tokens);

  // Resolve a mark kind to its tint here, not in the renderer: `PoemView`
  // composes tints without knowing that Activity 1's marks are what produced
  // them. Where layers overlap, the first in table order supplies the tint.
  const tokenHighlightClass = (index: number): string | undefined => {
    const kind = layerIndex.get(index)?.[0];
    return kind === undefined ? undefined : layerFor(kind).tokenClassName;
  };

  // Plain functions, not `useCallback`: nothing downstream is memoised, so
  // wrapping them would buy no re-render avoidance and only add dependency
  // arrays to keep correct.
  const handleTap = (index: number) => {
    setSelection((current) => tapToken(current, index));
  };

  const toggleLayer = (kind: MarkKind) => {
    setVisible((current) => {
      const next = new Set(current);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  };

  // Marking leaves the selection standing, so the mark it just made appears
  // straight away in the chip row below—undo is one tap, in the place the
  // learner is already looking.
  const addMark = (kind: MarkKind) => {
    const span = selectionSpan(selection);
    if (!span) return;
    actions.addMark({ id: crypto.randomUUID(), kind, span });
  };

  const complete = selection.phase === "complete";
  const span = selectionSpan(selection);
  // Removing a mark by reproducing its exact span would mean re-tapping both
  // ends, so the chips below take anything the selection merely touches.
  const touched = span ? marksOverlappingSpan(marks, span) : [];

  return (
    <div className="flex flex-col gap-4">
      <PoemView
        tokenised={tokenised}
        selection={selection}
        onTapToken={handleTap}
        tokenHighlightClass={tokenHighlightClass}
      />

      <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            {selection.phase === "empty" ? (
              <span className="text-muted-foreground">Tap a word to start a selection.</span>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {complete ? "Selected: " : "Tap the last word: "}
                </span>
                <span className="font-serif">{quoted}</span>
              </>
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={selection.phase === "empty"}
            onClick={() => setSelection(clearSelection())}
          >
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ANNOTATION_LAYERS.map((layer) => {
            // Already marked: the button goes quiet rather than silently
            // doing nothing, and the chip below is where it gets undone.
            const marked = span !== null && findMarkForSpan(marks, layer.kind, span) !== undefined;
            return (
              <Button
                key={layer.kind}
                variant="outline"
                size="sm"
                disabled={selection.phase === "empty" || marked}
                onClick={() => addMark(layer.kind)}
              >
                <span className={cn("size-3 rounded-full", layer.swatchClassName)} />
                Mark {layer.label.toLowerCase()}
              </Button>
            );
          })}
        </div>

        {touched.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">Marks here:</span>
            {touched.map((mark) => (
              <button
                key={mark.id}
                type="button"
                onClick={() => actions.removeMark(mark.id)}
                aria-label={`Remove ${layerFor(mark.kind).label} mark on “${quoteOf(mark.span)}”`}
                className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs hover:bg-accent"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    layerFor(mark.kind).swatchClassName,
                  )}
                />
                <span className="truncate font-serif">{quoteOf(mark.span)}</span>
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {ANNOTATION_LAYERS.map((layer) => {
            const shown = visible.has(layer.kind);
            return (
              <button
                key={layer.kind}
                type="button"
                aria-pressed={shown}
                onClick={() => toggleLayer(layer.kind)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-opacity",
                  shown ? "bg-accent" : "opacity-50",
                )}
              >
                <span className={cn("size-3 rounded-full", layer.swatchClassName)} />
                <span>{layer.label}</span>
                <span className="font-mono text-muted-foreground text-xs tabular-nums">
                  {counts[layer.kind]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
