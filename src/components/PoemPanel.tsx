/**
 * The poem as every activity shows it: the renderer, plus the Activity 1
 * annotation layers and their toggles.
 *
 * Vision.md makes the marks a layer "visible (toggleable) in all later
 * activities", so the toggles belong to no single activity—they belong to the
 * poem wherever it appears. This component is that common ground. Activity 1
 * fills its slots with the marker controls and the mark list (see
 * `./ReadSilentlyActivity`); an activity that only needs the poem on screen
 * passes neither, and gets a poem it cannot tap.
 *
 * Layer visibility lives here as React state, deliberately: which layers are
 * showing is view state, not study progress. What persists is the marks
 * themselves (see the note in `@/lib/session/model`).
 */

import { type ReactNode, useMemo, useState } from "react";
import { LayerSwatch } from "@/components/LayerSwatch";
import { PoemView } from "@/components/PoemView";
import {
  ANNOTATION_LAYERS,
  buildLayerIndex,
  countMarksByKind,
  layerFor,
} from "@/lib/annotationLayers";
import { EMPTY_SELECTION, type Selection } from "@/lib/selection";
import type { Mark, MarkKind } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface PoemPanelProps {
  tokenised: TokenisedPoem;
  /** The current attempt's marks, painted as layers. */
  marks: readonly Mark[];
  /**
   * Selecting in the poem: what is selected, and what a tap does. One prop
   * rather than two, because they are one decision—a selection nothing can
   * change, or taps that select invisibly, are states no activity means. Omit it
   * to render the poem inert; see {@link PoemView}'s `onTapToken`.
   */
  selecting?: {
    selection: Selection;
    onTapToken: (index: number) => void;
  };
  /** Content below the poem: Activity 1 puts its mark list here. */
  children?: ReactNode;
  /** Content pinned above the layer toggles: Activity 1's marker controls. */
  controls?: ReactNode;
}

const ALL_KINDS = ANNOTATION_LAYERS.map((layer) => layer.kind);

export function PoemPanel({ tokenised, marks, selecting, children, controls }: PoemPanelProps) {
  const [visible, setVisible] = useState<ReadonlySet<MarkKind>>(() => new Set(ALL_KINDS));

  const layerIndex = useMemo(() => buildLayerIndex(marks, visible), [marks, visible]);
  const counts = useMemo(() => countMarksByKind(marks), [marks]);

  // Resolve a mark kind to its tint here, not in the renderer: `PoemView`
  // composes tints without knowing that Activity 1's marks are what produced
  // them. Where layers overlap, the first in table order supplies the tint.
  const tokenHighlightClass = (index: number): string | undefined => {
    const kind = layerIndex.get(index)?.[0];
    return kind === undefined ? undefined : layerFor(kind).tokenClassName;
  };

  const toggleLayer = (kind: MarkKind) => {
    setVisible((current) => {
      const next = new Set(current);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PoemView
        tokenised={tokenised}
        selection={selecting?.selection ?? EMPTY_SELECTION}
        onTapToken={selecting?.onTapToken}
        tokenHighlightClass={tokenHighlightClass}
      />

      {children}

      <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
        {controls}

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
                <LayerSwatch kind={layer.kind} />
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
