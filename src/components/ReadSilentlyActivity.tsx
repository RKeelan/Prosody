/**
 * Activity 1: read silently.
 *
 * Vision.md: read the poem once without aids, and mark—but do not resolve—
 * wherever you stumble, lose the thread, or hit an odd word. Clean text, no
 * apparatus: the only furniture on this screen is the marker, the list of what
 * has been marked, and the confirmation that a pass happened.
 *
 * The activity is not graded. Its output is the annotation layer, which every
 * later activity shows (`./PoemPanel`) and the Activity 9 gate makes the
 * learner clear or dismiss. Confirming the pass is therefore the whole of
 * "completion"—it records that the read happened, and nothing else.
 *
 * Selection is React state here, not store state: a half-formed span is view
 * state that dies with the screen. The marks it produces are what persist.
 */

import { useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { LayerSwatch } from "@/components/LayerSwatch";
import { PoemPanel } from "@/components/PoemPanel";
import { Button } from "@/components/ui/button";
import type { ActivityInfo } from "@/lib/activityInfo";
import { ANNOTATION_LAYERS, layerFor, marksInReadingOrder } from "@/lib/annotationLayers";
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

interface ReadSilentlyActivityProps {
  info: ActivityInfo;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

export function ReadSilentlyActivity({ info, tokenised, store }: ReadSilentlyActivityProps) {
  const marks = useStore(store, (s) => s.session.currentAttempt.marks);
  const committed = useStore(
    store,
    (s) => s.session.currentAttempt.activities.readSilently.committed,
  );
  const actions = useStore(store, (s) => s.actions);

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);

  const listed = marksInReadingOrder(marks);
  const quoted = selectionText(selection, tokenised.lines, tokenised.tokens);

  // Plain functions, not `useCallback`: nothing downstream is memoised, so
  // wrapping them would buy no re-render avoidance and only add dependency
  // arrays to keep correct.
  const handleTap = (index: number) => {
    setSelection((current) => tapToken(current, index));
  };

  const addMark = (kind: MarkKind) => {
    const span = selectionSpan(selection);
    if (!span) return;
    actions.addMark({ id: crypto.randomUUID(), kind, span });
    setSelection(clearSelection());
  };

  const complete = selection.phase === "complete";
  const empty = selection.phase === "empty";

  // The marker: what is selected, and the three ways to mark it. Pinned above
  // the layer toggles by `PoemPanel`, so it stays to hand as the poem scrolls.
  const markerControls = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm">
          {empty ? (
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
          disabled={empty}
          onClick={() => setSelection(clearSelection())}
        >
          Clear
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ANNOTATION_LAYERS.map((layer) => (
          <Button
            key={layer.kind}
            variant="outline"
            size="sm"
            disabled={empty}
            onClick={() => addMark(layer.kind)}
          >
            <LayerSwatch kind={layer.kind} />
            Mark {layer.label.toLowerCase()}
          </Button>
        ))}
      </div>

      {/* The marks so far, as chips, here in the sticky bar rather than below
          the poem: a mark made mid-poem must be visible the moment it is made,
          and everything past the poem's last line is off a phone screen. One
          chip per mark, tapped to un-mark; a mark a later activity has resolved
          is inert—its record is meant to survive, so it wears its span without
          an un-mark tap. The run is height-capped and scrolls, so a heavily
          marked poem never buries the marker itself. */}
      {listed.length > 0 && (
        <ul className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
          {listed.map((mark) => {
            const layer = layerFor(mark.kind);
            const text = spanText(mark.span, tokenised.lines, tokenised.tokens);
            const chipClass =
              "flex max-w-[14rem] items-center gap-2 rounded-full border px-3 py-1.5 text-sm";
            return (
              <li key={mark.id}>
                {mark.status === "open" ? (
                  <button
                    type="button"
                    aria-label={`Remove the ${layer.label.toLowerCase()} mark on “${text}”`}
                    onClick={() => actions.removeMark(mark.id)}
                    className={cn(chipClass, "cursor-pointer hover:bg-accent")}
                  >
                    <LayerSwatch kind={mark.kind} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-serif">{text}</span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      ×
                    </span>
                  </button>
                ) : (
                  <span
                    className={cn(chipClass, "opacity-70")}
                    title="Resolved in a later activity"
                  >
                    <LayerSwatch kind={mark.kind} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-serif">{text}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <ActivityCard
      info={info}
      description="Read the poem through once, without aids. Tap the first and last word of anything that trips you, and mark it—don't stop to work it out. Later activities are where the marks get resolved."
    >
      <PoemPanel
        tokenised={tokenised}
        marks={marks}
        selecting={{ selection, onTapToken: handleTap }}
        controls={markerControls}
      >
        {/* The completion control sits below the poem, not in the sticky bar:
            you reach it by reading to the last line, which is the whole of the
            activity. Confirming does not close it—the store keeps marks mutable
            after commit, so a learner who reads again can still mark. */}
        <div className="flex flex-col gap-3 border-t pt-4">
          {committed ? (
            <p className="text-muted-foreground text-sm">
              Pass confirmed. Mark anything else you notice on a reread—these marks stay with you
              through the later activities.
            </p>
          ) : (
            <Button className="self-start" onClick={() => actions.commitActivity("readSilently")}>
              I've read it through
            </Button>
          )}
        </div>
      </PoemPanel>
    </ActivityCard>
  );
}
