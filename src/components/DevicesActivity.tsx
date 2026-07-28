/**
 * Activity 6: identify sentence-level devices.
 *
 * Vision.md's spot mode: hunt the poem for the granular techniques—anastrophe,
 * apostrophe, alliteration, irony, and whatever else the pack's palette carries—
 * by highlighting a span, naming it from the palette, and writing one line on the
 * work the device does. The palette is the pack's: each entry a definition and one
 * canonical example drawn from *another* poem, so studying it never gives away a
 * spot in the poem under study. The reference instances stay hidden until commit.
 *
 * On commit the reference instances reveal with their function notes, and the hunt
 * is auto-scored found / missed / false positive (`@/lib/deviceGrade`): a tag that
 * overlaps a reference instance of the same device found it, an instance no tag
 * caught is missed, a tag catching nothing is a false positive. The found count of
 * the total is the score. Each found instance also sets the learner's note beside
 * the reference's for a match / partial / miss self-grade—the app shows both
 * rather than judging a one-line note.
 *
 * $Claude Self-grades are post-commit decisions, so—as in Activities 3–5—they live
 * in React state, written through to the store as the miss list and reconstructed
 * from it on a reload (a found note self-graded a miss reads back "miss", one
 * without a stored miss "match", so a `partial` softens to "match" across a
 * reload). The headline score is auto-scored from the frozen answer, so it
 * survives a reload exactly regardless of the self-grades. The common flow—commit,
 * self-grade, review, no reload—is exact.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { PoemView, type TokenTint } from "@/components/PoemView";
import { Button } from "@/components/ui/button";
import {
  addTag,
  coerceDeviceAnswer,
  type DeviceAnswer,
  emptyDeviceAnswer,
  removeTag,
  setTagNote,
  tagById,
} from "@/lib/deviceAnswer";
import {
  matchDevices,
  type ReferenceDevice,
  resolveDevice,
  type SelfGrade,
} from "@/lib/deviceGrade";
import type { DevicePaletteEntry, Pack } from "@/lib/pack";
import {
  clearSelection,
  EMPTY_SELECTION,
  type Selection,
  selectionSpan,
  selectionText,
  spanText,
  tapToken,
} from "@/lib/selection";
import type { SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface DevicesActivityProps {
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

/** The tint for a token the learner has tagged; the selection outranks it in `PoemView`. */
const DEVICE_TINT: TokenTint = { className: "bg-teal-200/70 dark:bg-teal-400/25", key: "device" };

/** Each self-grade's short label, match → partial → miss. */
const SELF_GRADES: readonly { grade: SelfGrade; label: string }[] = [
  { grade: "match", label: "Match" },
  { grade: "partial", label: "Partial" },
  { grade: "miss", label: "Miss" },
];

/** A missed reference instance's stable miss id. */
function missedId(index: number): string {
  return `device-${index}`;
}

/** A found instance's note-miss id, distinct from the missed-instance id. */
function noteMissId(index: number): string {
  return `note-${index}`;
}

export function DevicesActivity({ pack, tokenised, store }: DevicesActivityProps) {
  const palette = useMemo(() => pack.devices?.palette ?? [], [pack.devices]);
  const instances = useMemo(() => pack.devices?.instances ?? [], [pack.devices]);
  const paletteById = useMemo(
    () => new Map(palette.map((entry) => [entry.id, entry] as const)),
    [palette],
  );

  const committed = useStore(store, (s) => s.session.currentAttempt.activities.devices.committed);
  const rawAnswers = useStore(store, (s) => s.session.currentAttempt.activities.devices.answers);
  const storedMisses = useStore(store, (s) => s.session.currentAttempt.activities.devices.misses);
  const actions = useStore(store, (s) => s.actions);

  const references = useMemo<ReferenceDevice[]>(
    () => instances.map((inst) => resolveDevice(tokenised.tokens, inst)),
    [instances, tokenised],
  );

  // Each reference instance's quoted text and device name, for the reveal. An
  // unresolvable anchor (a broken pack) falls back to the anchor's own text.
  const located = useMemo(() => {
    const texts = references.map((ref, i) =>
      ref.span ? spanText(ref.span, tokenised.lines, tokenised.tokens) : instances[i].anchor.exact,
    );
    const names = references.map((ref) => paletteById.get(ref.deviceId)?.name ?? ref.deviceId);
    return { texts, names };
  }, [references, instances, tokenised, paletteById]);

  const answer = useMemo(
    () =>
      rawAnswers ? coerceDeviceAnswer(rawAnswers, tokenised.tokens.length) : emptyDeviceAnswer(),
    [rawAnswers, tokenised],
  );

  const grade = useMemo(() => matchDevices(references, answer.tags), [references, answer]);

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Reconstruct self-grades from the persisted miss list on a committed mount (a
  // reload, or stepping back). Each found instance reads "miss" when a note-miss
  // is stored, "match" otherwise—see the module note.
  const [selfGrades, setSelfGrades] = useState<Record<number, SelfGrade>>(() => {
    if (!committed) return {};
    const seed: Record<number, SelfGrade> = {};
    grade.references.forEach((result, i) => {
      if (result.found)
        seed[i] = storedMisses.some((m) => m.id === noteMissId(i)) ? "miss" : "match";
    });
    return seed;
  });

  // Tokens any tag covers, for the hunt-phase tint. One uniform tint: the list
  // below carries which device each span is, so overlapping tags never fight over
  // a token's colour the way per-device tints would.
  const taggedTokens = useMemo(() => {
    const set = new Set<number>();
    for (const tag of answer.tags) {
      for (let t = tag.span.start; t < tag.span.end; t++) set.add(t);
    }
    return set;
  }, [answer]);

  if (palette.length === 0) {
    return (
      <ActivityCard description="This poem has no device palette to hunt with.">
        <p className="text-muted-foreground text-sm">Nothing to spot here.</p>
      </ActivityCard>
    );
  }

  // Every mutation builds on the answer read straight from the store, not the
  // render-time closure, so a tag added or a note typed in quick succession
  // never builds on a write React has not yet re-rendered (see Activity 4).
  const readAnswer = (): DeviceAnswer =>
    coerceDeviceAnswer(
      store.getState().session.currentAttempt.activities.devices.answers,
      tokenised.tokens.length,
    );

  const tagSelection = (deviceId: string) => {
    const span = selectionSpan(selection);
    if (!span) return;
    const tag = { id: crypto.randomUUID(), deviceId, span, note: "" };
    actions.recordAnswers("devices", addTag(readAnswer(), tag));
    setSelection(clearSelection());
  };

  const editNote = (id: string, note: string) => {
    actions.recordAnswers("devices", setTagNote(readAnswer(), id, note));
  };

  const dropTag = (id: string) => {
    actions.recordAnswers("devices", removeTag(readAnswer(), id));
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const syncGrades = (nextSelfGrades: Record<number, SelfGrade>) => {
    const next = matchDevices(references, readAnswer().tags);
    actions.setScore("devices", { total: next.total, correct: next.found });
    actions.setMisses(
      "devices",
      next.references.flatMap((result, i) => {
        if (!result.found) {
          return [
            {
              id: missedId(i),
              description: `“${located.texts[i]}” — ${located.names[i]} not spotted`,
            },
          ];
        }
        if (nextSelfGrades[i] === "miss") {
          return [
            {
              id: noteMissId(i),
              description: `“${located.texts[i]}” — ${located.names[i]} note off the mark`,
            },
          ];
        }
        return [];
      }),
    );
  };

  const commit = () => {
    const graded = matchDevices(references, readAnswer().tags);
    actions.commitActivity("devices", { total: graded.total, correct: graded.found });
    syncGrades({});
  };

  const setSelfGrade = (index: number, value: SelfGrade) => {
    const next = { ...selfGrades, [index]: value };
    setSelfGrades(next);
    syncGrades(next);
  };

  if (committed) {
    return (
      <ActivityCard description="The reference instances. Each device you found sits beside the reference note for you to grade; the ones you missed are named so you can see them. A missed device feeds the session summary.">
        <RevealList
          references={references}
          texts={located.texts}
          names={located.names}
          deviceName={(id) => paletteById.get(id)?.name ?? id}
          answer={answer}
          grade={grade}
          selfGrades={selfGrades}
          tokenised={tokenised}
          onSelfGrade={setSelfGrade}
        />
      </ActivityCard>
    );
  }

  const tokenTint = (index: number): TokenTint | undefined =>
    taggedTokens.has(index) ? DEVICE_TINT : undefined;

  const span = selectionSpan(selection);
  const selectedText = selectionText(selection, tokenised.lines, tokenised.tokens);

  const controls = (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {selection.phase === "empty" ? (
          <p className="text-muted-foreground text-sm">
            Tap the first and last word of a device, then name it below.
          </p>
        ) : (
          <p className="min-w-0 text-sm">
            <span className="text-muted-foreground">
              {selection.phase === "anchored" ? "Tap the last word: " : "Selected: "}
            </span>
            <span className="font-serif">{selectedText}</span>
          </p>
        )}
        <p className="text-muted-foreground text-sm tabular-nums">{answer.tags.length} tagged</p>
      </div>

      <ul className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
        {palette.map((entry) => (
          <PaletteRow
            key={entry.id}
            entry={entry}
            expanded={expanded.has(entry.id)}
            canTag={span !== null}
            onToggle={() => toggleExpanded(entry.id)}
            onTag={() => tagSelection(entry.id)}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          Tag every device you can find. Committing is final for this attempt.
        </p>
        <Button onClick={commit}>Commit and check</Button>
      </div>
    </div>
  );

  return (
    <ActivityCard description="Hunt the poem for its sentence-level devices. Tap a span, name it from the palette, and write one line on the work it does. The reference instances stay hidden until you commit.">
      <div className="flex flex-col gap-4">
        <PoemView
          tokenised={tokenised}
          selection={selection}
          onTapToken={(index) => setSelection((current) => tapToken(current, index))}
          tokenTint={tokenTint}
        />

        {answer.tags.length > 0 && (
          <ul className="flex flex-col gap-3">
            {answer.tags.map((tag) => {
              const name = paletteById.get(tag.deviceId)?.name ?? tag.deviceId;
              const text = spanText(tag.span, tokenised.lines, tokenised.tokens);
              return (
                <li key={tag.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 text-sm">
                      <span className="rounded bg-teal-200/80 px-1.5 py-0.5 font-medium text-xs dark:bg-teal-400/25">
                        {name}
                      </span>{" "}
                      <span className="font-serif text-muted-foreground">“{text}”</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dropTag(tag.id)}
                      aria-label={`Remove the ${name} tag on “${text}”`}
                    >
                      Remove
                    </Button>
                  </div>
                  <input
                    value={tag.note}
                    onChange={(e) => editNote(tag.id, e.target.value)}
                    placeholder="One line: what work is the device doing here?"
                    aria-label={`What the ${name} on “${text}” does`}
                    className="rounded-md border bg-background px-3 py-2 font-serif text-sm"
                  />
                </li>
              );
            })}
          </ul>
        )}

        {controls}
      </div>
    </ActivityCard>
  );
}

interface PaletteRowProps {
  entry: DevicePaletteEntry;
  expanded: boolean;
  canTag: boolean;
  onToggle: () => void;
  onTag: () => void;
}

/** One palette device: a tap-to-expand definition and example, and a tag action. */
function PaletteRow({ entry, expanded, canTag, onToggle, onTag }: PaletteRowProps) {
  return (
    <li className="rounded-md border">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        >
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="font-medium">{entry.name}</span>
        </button>
        <Button variant="outline" size="sm" disabled={!canTag} onClick={onTag}>
          Tag it
        </Button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 border-t px-3 py-2 text-sm">
          <p className="text-muted-foreground">{entry.definition}</p>
          <blockquote className="border-l-2 pl-2">
            <span className="font-serif">“{entry.canonicalExample.text}”</span>
            <span className="text-muted-foreground text-xs">
              {" "}
              — {entry.canonicalExample.source}
            </span>
          </blockquote>
        </div>
      )}
    </li>
  );
}

interface RevealListProps {
  references: readonly ReferenceDevice[];
  texts: readonly string[];
  names: readonly string[];
  /** The palette name for a tag's device id, for labelling a false positive. */
  deviceName: (deviceId: string) => string;
  answer: DeviceAnswer;
  grade: ReturnType<typeof matchDevices>;
  selfGrades: Record<number, SelfGrade>;
  tokenised: TokenisedPoem;
  onSelfGrade: (index: number, grade: SelfGrade) => void;
}

/** The post-commit reveal: the score, each reference instance, and the false positives. */
function RevealList({
  references,
  texts,
  names,
  deviceName,
  answer,
  grade,
  selfGrades,
  tokenised,
  onSelfGrade,
}: RevealListProps) {
  const ungraded = grade.references.filter((r, i) => r.found && selfGrades[i] === undefined).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums">
        <p>
          <span className="text-muted-foreground">Devices found: </span>
          <span className="font-medium">
            {grade.found}/{grade.total}
          </span>
        </p>
        {grade.falsePositives.length > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            {grade.falsePositives.length} false positive
            {grade.falsePositives.length === 1 ? "" : "s"}
          </p>
        )}
        {ungraded > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            {ungraded} note{ungraded === 1 ? "" : "s"} await your self-assessment.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-4">
        {references.map((reference, i) => {
          const result = grade.references[i];
          const learnerNote = result.tagId
            ? tagById(answer, result.tagId)?.note?.trim()
            : undefined;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: reference instances are a fixed, ordered list
            <li key={i} className="flex flex-col gap-2 border-t pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <span className="rounded bg-teal-200/80 px-1.5 py-0.5 font-medium text-xs dark:bg-teal-400/25">
                    {names[i]}
                  </span>{" "}
                  <span className="font-serif">“{texts[i]}”</span>
                </p>
                <FoundBadge found={result.found} />
              </div>

              <p className="text-sm">
                <span className="text-muted-foreground">What it does: </span>
                <span className="font-serif">{reference.functionNote}</span>
              </p>

              {result.found && (
                <>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Your note: </span>
                    {learnerNote ? (
                      <span className="font-serif">{learnerNote}</span>
                    ) : (
                      <span className="text-muted-foreground italic">left blank</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-sm">Grade your note:</span>
                    {SELF_GRADES.map(({ grade: value, label }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selfGrades[i] === value}
                        onClick={() => onSelfGrade(i, value)}
                        className={cn(
                          "cursor-pointer rounded-md border px-3 py-1 text-sm",
                          selfGrades[i] === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {grade.falsePositives.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="font-medium text-sm">Not in the reference set</p>
          <ul className="flex flex-col gap-2">
            {grade.falsePositives.map((id) => {
              const tag = tagById(answer, id);
              if (!tag) return null;
              const name = deviceName(tag.deviceId);
              const text = spanText(tag.span, tokenised.lines, tokenised.tokens);
              return (
                <li key={id} className="text-sm">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-xs">{name}</span>{" "}
                  <span className="font-serif text-muted-foreground">“{text}”</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A reference instance's found/missed state as a coloured badge. */
function FoundBadge({ found }: { found: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium text-xs",
        found
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-red-500/15 text-red-800 dark:text-red-300",
      )}
    >
      {found ? "found ✓" : "missed ✗"}
    </span>
  );
}
