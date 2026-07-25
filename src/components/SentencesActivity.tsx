/**
 * Activity 4: identify the subject, verb, and object of every sentence.
 *
 * Vision.md: work sentence by sentence. The poem is re-rendered with its
 * sentences numbered; the learner picks one and names its subject, main verb,
 * and object-or-complement—each by tapping a span in the poem or typing an
 * implied part—plus a one-line "who does what to whom" paraphrase. "No object"
 * is a first-class answer, for the intransitives and copulars where naming an
 * object would be wrong. A sentence *clears* only when all four parts pass.
 *
 * Grading follows the same two routes as Activity 3, in `@/lib/sentenceGrade`:
 * span answers auto-check exact/overlap against the reference (both pass), typed
 * answers and the paraphrase are revealed beside the reference on commit for the
 * learner to self-grade, and "no object" is checked against the pack's record.
 * Every missed part feeds the Activity 9 gate.
 *
 * $Claude Self-grades are post-commit decisions, so—as in Activity 3—they live
 * in React state, written through to the store as the derived score and miss
 * list, and reconstructed from the persisted miss list on a reload (a
 * self-graded part with a stored miss reads back "miss", one without "match", so
 * a `partial` softens to "match" across a reload). The common flow—commit,
 * self-grade, review, no reload—is exact.
 *
 * $Claude The clause-nesting step Vision.md gives gnarly sentences is shown here
 * as the reference clause tree once the sentence's parts are revealed. It is a
 * study aid, not part of the clearing criteria (Vision.md's "cleared" rule names
 * only subject, verb, object, and paraphrase); making the learner rebuild the
 * tree by hand—the tap-based interaction Plan.md calls for—is deferred to its
 * own task so this one stays a reviewable unit.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { PoemView, type TokenTint } from "@/components/PoemView";
import { Button } from "@/components/ui/button";
import { resolveAnchor } from "@/lib/anchor";
import type { AnswerTarget, ClauseNode, Pack, Sentence } from "@/lib/pack";
import {
  EMPTY_SELECTION,
  type Selection,
  selectionSpan,
  selectionText,
  spanText,
  tapToken,
} from "@/lib/selection";
import {
  answeredSentenceCount,
  clearObject,
  clearPart,
  coerceSentenceAnswer,
  emptySentenceAnswer,
  type ObjectAnswer,
  type PartResponse,
  responseFor,
  type SentenceResponse,
  setObjectNone,
  setObjectSpan,
  setObjectText,
  setParaphrase,
  setPartSpan,
  setPartText,
} from "@/lib/sentenceAnswer";
import {
  gradeSentences,
  type PartOutcome,
  type ReferenceSentence,
  resolveSentence,
  type SelfGrade,
  SLOTS,
  type Slot,
  selfGradeKey,
} from "@/lib/sentenceGrade";
import type { SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface SentencesActivityProps {
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

/** The three tappable slots and their tints, in reading order; paraphrase is typed apart. */
const SPAN_SLOTS = [
  { slot: "subject", label: "Subject", tint: "bg-sky-200/70 dark:bg-sky-400/25" },
  { slot: "verb", label: "Verb", tint: "bg-amber-200/70 dark:bg-amber-400/25" },
  { slot: "object", label: "Object", tint: "bg-emerald-200/70 dark:bg-emerald-400/25" },
] as const satisfies readonly { slot: Exclude<Slot, "paraphrase">; label: string; tint: string }[];

type SpanSlot = (typeof SPAN_SLOTS)[number]["slot"];

/** The tint painted over the active sentence's tokens that no marked part covers. */
const ACTIVE_SENTENCE_TINT: TokenTint = {
  className: "bg-zinc-200/80 dark:bg-zinc-700/50",
  key: "active-sentence",
};

/** The active sentence's number badge, coloured to sit inside its highlight band. */
const ACTIVE_NUMBER_CLASS = "bg-zinc-300 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-50";

/** Each self-grade's short label, match → partial → miss. */
const SELF_GRADES: readonly { grade: SelfGrade; label: string }[] = [
  { grade: "match", label: "Match" },
  { grade: "partial", label: "Partial" },
  { grade: "miss", label: "Miss" },
];

/** One reference target as text: a span quoted from the poem, or the typed part. */
function targetText(target: AnswerTarget, tokenised: TokenisedPoem): string {
  if (target.kind === "text") return target.text;
  const result = resolveAnchor(tokenised.tokens, target.anchor);
  return result.status === "resolved"
    ? spanText(result.span, tokenised.lines, tokenised.tokens)
    : target.anchor.exact;
}

/** A learner span/text response as a short readout, or null when the part is unanswered. */
function partText(response: PartResponse | undefined, tokenised: TokenisedPoem): string | null {
  if (!response) return null;
  return response.kind === "span"
    ? spanText(response.span, tokenised.lines, tokenised.tokens)
    : response.text;
}

/** The object answer as a readout: "no object", a span/typed part, or null when unanswered. */
function objectText(answer: ObjectAnswer | undefined, tokenised: TokenisedPoem): string | null {
  if (!answer) return null;
  if (answer.kind === "none") return "no object";
  return partText(answer, tokenised);
}

/** Whether a slot's answer is self-graded (typed, or the always-typed paraphrase). */
function slotIsSelfGraded(response: SentenceResponse, slot: Slot): boolean {
  if (slot === "paraphrase") return response.paraphrase !== undefined;
  if (slot === "object") return response.object?.kind === "text";
  return response[slot]?.kind === "text";
}

/** The typed text a slot currently holds, for seeding the draft input. */
function typedTextOf(response: SentenceResponse, slot: SpanSlot): string {
  const part = slot === "object" ? response.object : response[slot];
  return part?.kind === "text" ? part.text : "";
}

/** True when token `index` lies within `span`. */
function covers(span: { start: number; end: number }, index: number): boolean {
  return index >= span.start && index < span.end;
}

/** The one-line miss the gate shows for a failed part. */
function missDescription(sentenceIndex: number, slot: Slot, outcome: PartOutcome): string {
  const reason = outcome === "unanswered" ? "left blank" : "missed";
  return `Sentence ${sentenceIndex + 1}, ${slot} — ${reason}`;
}

export function SentencesActivity({ pack, tokenised, store }: SentencesActivityProps) {
  const sentences = pack.sentences ?? [];

  const committed = useStore(store, (s) => s.session.currentAttempt.activities.sentences.committed);
  const rawAnswers = useStore(store, (s) => s.session.currentAttempt.activities.sentences.answers);
  const storedMisses = useStore(store, (s) => s.session.currentAttempt.activities.sentences.misses);
  const actions = useStore(store, (s) => s.actions);

  // Each sentence's span in the poem, and a first-token → sentence lookup for the
  // numbered markers. An unresolvable anchor (a broken pack) drops out silently;
  // the validator reports it.
  const located = useMemo(() => {
    const spans = sentences.map((s) => {
      const result = resolveAnchor(tokenised.tokens, s.anchor);
      return result.status === "resolved" ? result.span : null;
    });
    const firstToken = new Map<number, number>();
    spans.forEach((span, i) => {
      if (span) firstToken.set(span.start, i);
    });
    return { spans, firstToken };
  }, [sentences, tokenised]);

  const references = useMemo<ReferenceSentence[]>(
    () => sentences.map((s) => resolveSentence(tokenised.tokens, s)),
    [sentences, tokenised],
  );

  const answer = useMemo(
    () => (rawAnswers ? coerceSentenceAnswer(rawAnswers, sentences.length) : emptySentenceAnswer()),
    [rawAnswers, sentences.length],
  );

  // Every sentence's assigned span parts, mapped token → tint, so the parse stays
  // lit across the whole poem: moving to another sentence never blanks the parts
  // already marked. Keyed per sentence and slot so each run fills its own gaps
  // without bleeding into a neighbour that shares a colour.
  const partTints = useMemo(() => {
    const map = new Map<number, TokenTint>();
    for (const [key, response] of Object.entries(answer.sentences)) {
      const i = Number(key);
      for (const { slot, tint } of SPAN_SLOTS) {
        const part = slot === "object" ? response.object : response[slot];
        if (part?.kind !== "span") continue;
        const value: TokenTint = { className: tint, key: `${i}-${slot}` };
        for (let t = part.span.start; t < part.span.end; t++) map.set(t, value);
      }
    }
    return map;
  }, [answer]);

  const [active, setActive] = useState(0);
  const [activeSlot, setActiveSlot] = useState<SpanSlot>("subject");
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [draft, setDraft] = useState("");
  const [paraphrase, setParaphraseDraft] = useState(() => responseFor(answer, 0).paraphrase ?? "");

  // Reconstruct self-grades from the persisted miss list on a committed mount (a
  // reload, or stepping back). Each self-graded part reads "miss" when a matching
  // miss is stored, "match" otherwise—see the module note.
  const [selfGrades, setSelfGrades] = useState<Record<string, SelfGrade>>(() => {
    if (!committed) return {};
    const seed: Record<string, SelfGrade> = {};
    sentences.forEach((_, i) => {
      const response = responseFor(answer, i);
      for (const slot of SLOTS) {
        if (!slotIsSelfGraded(response, slot)) continue;
        const key = selfGradeKey(i, slot);
        seed[key] = storedMisses.some((m) => m.id === missId(i, slot)) ? "miss" : "match";
      }
    });
    return seed;
  });

  const grade = useMemo(
    () => gradeSentences(references, answer, selfGrades),
    [references, answer, selfGrades],
  );

  if (sentences.length === 0) {
    return (
      <ActivityCard description="This poem has no sentences to parse.">
        <p className="text-muted-foreground text-sm">Nothing to parse here.</p>
      </ActivityCard>
    );
  }

  const activeResponse = responseFor(answer, active);
  const activeSpan = located.spans[active];

  // Every mutation builds on the answer read straight from the store, not the
  // render-time `answer` closure. Rapid taps (assigning subject then verb then
  // object in quick succession) can fire a handler before React has re-rendered
  // with the previous write, and building on the stale closure would drop the
  // part just set. `store.getState()` is always current, so parts accumulate.
  const readAnswer = () =>
    coerceSentenceAnswer(
      store.getState().session.currentAttempt.activities.sentences.answers,
      sentences.length,
    );

  const selectSentence = (index: number) => {
    setActive(index);
    setActiveSlot("subject");
    setSelection(EMPTY_SELECTION);
    setDraft(typedTextOf(responseFor(answer, index), "subject"));
    setParaphraseDraft(responseFor(answer, index).paraphrase ?? "");
  };

  // Tapping a part is how a span is assigned: with text already selected it
  // labels that selection as this part—select, then tap the part—so the
  // selection is used, never discarded. With nothing selected it just makes the
  // part active, for typing an implied answer or a following selection.
  const selectSlot = (slot: SpanSlot) => {
    const span = selectionSpan(selection);
    if (span) {
      const base = readAnswer();
      const next =
        slot === "object"
          ? setObjectSpan(base, active, span)
          : setPartSpan(base, active, slot, span);
      actions.recordAnswers("sentences", next);
      setActiveSlot(slot);
      setSelection(EMPTY_SELECTION);
      setDraft("");
      return;
    }
    setActiveSlot(slot);
    setDraft(typedTextOf(activeResponse, slot));
  };

  const applyTyped = () => {
    if (draft.trim().length === 0) return;
    const base = readAnswer();
    const next =
      activeSlot === "object"
        ? setObjectText(base, active, draft)
        : setPartText(base, active, activeSlot, draft);
    actions.recordAnswers("sentences", next);
  };

  const clearActiveSlot = () => {
    const base = readAnswer();
    const next =
      activeSlot === "object" ? clearObject(base, active) : clearPart(base, active, activeSlot);
    actions.recordAnswers("sentences", next);
    setSelection(EMPTY_SELECTION);
    setDraft("");
  };

  const markNoObject = () => {
    actions.recordAnswers("sentences", setObjectNone(readAnswer(), active));
    setSelection(EMPTY_SELECTION);
    setDraft("");
  };

  const onParaphrase = (text: string) => {
    setParaphraseDraft(text);
    actions.recordAnswers("sentences", setParaphrase(readAnswer(), active, text));
  };

  const syncGrades = (nextSelfGrades: Record<string, SelfGrade>) => {
    const next = gradeSentences(references, readAnswer(), nextSelfGrades);
    actions.setScore("sentences", { total: next.total, correct: next.cleared });
    actions.setMisses(
      "sentences",
      next.results.flatMap((result, i) =>
        result.misses.map((m) => ({
          id: missId(i, m.slot),
          description: missDescription(i, m.slot, m.outcome),
        })),
      ),
    );
  };

  const commit = () => {
    const graded = gradeSentences(references, readAnswer(), {});
    actions.commitActivity("sentences", { total: graded.total, correct: graded.cleared });
    syncGrades({});
  };

  const setSelfGrade = (index: number, slot: Slot, value: SelfGrade) => {
    const next = { ...selfGrades, [selfGradeKey(index, slot)]: value };
    setSelfGrades(next);
    syncGrades(next);
  };

  if (committed) {
    return (
      <ActivityCard description="The reference parse. Your spans are checked against it; your typed answers and paraphrases sit beside the reference for you to grade. A sentence clears only when all four parts pass.">
        <RevealList
          sentences={sentences}
          references={references}
          answer={answer}
          grade={grade}
          selfGrades={selfGrades}
          tokenised={tokenised}
          onSelfGrade={setSelfGrade}
        />
      </ActivityCard>
    );
  }

  // A part's tint (from any sentence) wins; otherwise the active sentence's band
  // marks which sentence is in focus. The band never overpaints another
  // sentence's part—sentences do not overlap, so a token in the active band
  // belongs to the active sentence alone.
  const tokenTint = (index: number): TokenTint | undefined => {
    const part = partTints.get(index);
    if (part) return part;
    if (activeSpan && covers(activeSpan, index)) return ACTIVE_SENTENCE_TINT;
    return undefined;
  };

  const answeredHere = answeredSentenceCount(answer);
  const selectedText = selectionText(selection, tokenised.lines, tokenised.tokens);
  const activeSlotLabel = SPAN_SLOTS.find((s) => s.slot === activeSlot)?.label ?? "part";

  const controls = (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {sentences.map((_, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: sentences are a fixed, ordered list
              key={i}
              type="button"
              aria-pressed={i === active}
              aria-label={`Sentence ${i + 1}`}
              onClick={() => selectSentence(i)}
              className={cn(
                "size-7 cursor-pointer rounded-md border text-sm tabular-nums",
                i === active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {answeredHere}/{sentences.length} answered
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SPAN_SLOTS.map(({ slot, label, tint }) => {
          const value =
            slot === "object"
              ? objectText(activeResponse.object, tokenised)
              : partText(activeResponse[slot], tokenised);
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={slot === activeSlot}
              onClick={() => selectSlot(slot)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left",
                slot === activeSlot ? "border-primary ring-1 ring-primary" : "hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-1.5 font-medium text-xs">
                <span className={cn("size-2.5 rounded-full", tint)} />
                {label}
              </span>
              <span
                className={cn(
                  "w-full truncate text-sm",
                  value ? "font-serif" : "text-muted-foreground italic",
                )}
              >
                {value ?? "—"}
              </span>
            </button>
          );
        })}
      </div>

      {selection.phase !== "empty" ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Selected: </span>
          <span className="font-serif">{selectedText}</span>
          <span className="text-muted-foreground">
            {selection.phase === "anchored"
              ? " · tap another word to extend, or a part above to assign it"
              : " · tap a part above to assign it"}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Tap words in the poem to select a span, then tap the part it fills—or type an implied part
          below.
        </p>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applyTyped();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. (implied) you"
          aria-label={`Type the ${activeSlotLabel.toLowerCase()} of sentence ${active + 1}`}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={draft.trim().length === 0}>
          Type it
        </Button>
        {activeSlot === "object" && (
          <Button type="button" variant="outline" size="sm" onClick={markNoObject}>
            No object
          </Button>
        )}
        {(activeSlot === "object" ? activeResponse.object : activeResponse[activeSlot]) && (
          <Button type="button" variant="ghost" size="sm" onClick={clearActiveSlot}>
            Clear
          </Button>
        )}
      </form>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          Paraphrase—who does what to whom, in plain word order:
        </span>
        <input
          value={paraphrase}
          onChange={(e) => onParaphrase(e.target.value)}
          placeholder="e.g. The speaker met a traveller from an ancient land."
          aria-label={`Paraphrase of sentence ${active + 1}`}
          className="rounded-md border bg-background px-3 py-2 font-serif"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          Tap a numbered sentence to switch. Committing is final for this attempt.
        </p>
        <Button onClick={commit}>Commit and check</Button>
      </div>
    </div>
  );

  return (
    <ActivityCard description="Work sentence by sentence. Pick a numbered sentence, then name its subject, verb, and object—by tapping a span or typing an implied part—and paraphrase it. The reference stays hidden until you commit.">
      <div className="flex flex-col gap-4">
        <PoemView
          tokenised={tokenised}
          selection={selection}
          onTapToken={(index) => setSelection((current) => tapToken(current, index))}
          tokenTint={tokenTint}
          renderLead={(index) => {
            const sentence = located.firstToken.get(index);
            if (sentence === undefined) return undefined;
            return (
              <sup
                className={cn(
                  "mr-0.5 rounded px-1 py-0.5 font-sans font-semibold text-[0.6rem] tabular-nums",
                  sentence === active ? ACTIVE_NUMBER_CLASS : "text-muted-foreground",
                )}
              >
                {sentence + 1}
              </sup>
            );
          }}
        />
        {controls}
      </div>
    </ActivityCard>
  );
}

/** A miss's stable id, shared by the store and the reload reconstruction. */
function missId(sentenceIndex: number, slot: Slot): string {
  return `sentence-${sentenceIndex}-${slot}`;
}

interface RevealListProps {
  sentences: readonly Sentence[];
  references: readonly ReferenceSentence[];
  answer: ReturnType<typeof coerceSentenceAnswer>;
  grade: ReturnType<typeof gradeSentences>;
  selfGrades: Record<string, SelfGrade>;
  tokenised: TokenisedPoem;
  onSelfGrade: (index: number, slot: Slot, grade: SelfGrade) => void;
}

/** The post-commit reveal: each sentence's reference parse, its verdict, and the miss list. */
function RevealList({
  sentences,
  answer,
  grade,
  selfGrades,
  tokenised,
  onSelfGrade,
}: RevealListProps) {
  const cleared = grade.cleared;
  const ungraded = grade.results.reduce(
    (n, r) => n + SLOTS.filter((s) => r[s] === "ungraded").length,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums">
        <p>
          <span className="text-muted-foreground">Cleared: </span>
          <span className="font-medium">
            {cleared}/{grade.total}
          </span>
        </p>
        {ungraded > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            {ungraded} answer{ungraded === 1 ? "" : "s"} await your self-assessment.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-4">
        {sentences.map((sentence, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: sentences are a fixed, ordered list
          <li key={i} className="flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-sm">Sentence {i + 1}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium text-xs",
                  grade.results[i].cleared
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {grade.results[i].cleared ? "cleared ✓" : "not cleared"}
              </span>
            </div>

            <SlotRow
              label="Subject"
              learner={partText(responseFor(answer, i).subject, tokenised)}
              learnerKind={responseFor(answer, i).subject?.kind}
              reference={referenceTexts(
                sentence.subject.answer,
                sentence.subject.alternates,
                tokenised,
              )}
              outcome={grade.results[i].subject}
              selfGraded={slotIsSelfGraded(responseFor(answer, i), "subject")}
              selfGrade={selfGrades[selfGradeKey(i, "subject")]}
              onSelfGrade={(g) => onSelfGrade(i, "subject", g)}
            />
            <SlotRow
              label="Verb"
              learner={partText(responseFor(answer, i).verb, tokenised)}
              learnerKind={responseFor(answer, i).verb?.kind}
              reference={referenceTexts(sentence.verb.answer, sentence.verb.alternates, tokenised)}
              outcome={grade.results[i].verb}
              selfGraded={slotIsSelfGraded(responseFor(answer, i), "verb")}
              selfGrade={selfGrades[selfGradeKey(i, "verb")]}
              onSelfGrade={(g) => onSelfGrade(i, "verb", g)}
            />
            <SlotRow
              label="Object"
              learner={objectText(responseFor(answer, i).object, tokenised)}
              learnerKind={responseFor(answer, i).object?.kind === "text" ? "text" : undefined}
              reference={
                sentence.object.kind === "none"
                  ? ["no object"]
                  : referenceTexts(
                      sentence.object.target.answer,
                      sentence.object.target.alternates,
                      tokenised,
                    )
              }
              outcome={grade.results[i].object}
              selfGraded={slotIsSelfGraded(responseFor(answer, i), "object")}
              selfGrade={selfGrades[selfGradeKey(i, "object")]}
              onSelfGrade={(g) => onSelfGrade(i, "object", g)}
            />
            <SlotRow
              label="Paraphrase"
              learner={responseFor(answer, i).paraphrase ?? null}
              learnerKind="text"
              reference={[sentence.paraphrase]}
              outcome={grade.results[i].paraphrase}
              selfGraded={slotIsSelfGraded(responseFor(answer, i), "paraphrase")}
              selfGrade={selfGrades[selfGradeKey(i, "paraphrase")]}
              onSelfGrade={(g) => onSelfGrade(i, "paraphrase", g)}
            />

            {sentence.gnarly && <ClauseTreeView root={sentence.gnarly} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The reference answer plus its alternates, each rendered to text. */
function referenceTexts(
  answer: AnswerTarget,
  alternates: readonly AnswerTarget[],
  tokenised: TokenisedPoem,
): string[] {
  return [answer, ...alternates].map((t) => targetText(t, tokenised));
}

interface SlotRowProps {
  label: string;
  learner: string | null;
  learnerKind: PartResponse["kind"] | undefined;
  reference: readonly string[];
  outcome: PartOutcome;
  /** Whether this slot is judged by the learner (a typed answer or the paraphrase). */
  selfGraded: boolean;
  selfGrade: SelfGrade | undefined;
  onSelfGrade: (grade: SelfGrade) => void;
}

/** One part's row in the reveal: the learner's answer, the reference, a verdict, self-grade taps. */
function SlotRow({
  label,
  learner,
  learnerKind,
  reference,
  outcome,
  selfGraded,
  selfGrade,
  onSelfGrade,
}: SlotRowProps) {
  return (
    <div className="flex flex-col gap-1 pl-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
        <OutcomeBadge outcome={outcome} />
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">You said: </span>
        {learner === null ? (
          <span className="text-muted-foreground italic">left blank</span>
        ) : (
          <span className="font-serif">
            {learner}
            {learnerKind === "text" && <span className="text-muted-foreground"> (typed)</span>}
          </span>
        )}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Reference: </span>
        <span className="font-serif">{reference[0]}</span>
        {reference.length > 1 && (
          <span className="text-muted-foreground">
            {" "}
            · also accepted: {reference.slice(1).join("; ")}
          </span>
        )}
      </p>
      {selfGraded && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Grade yourself:</span>
          {SELF_GRADES.map(({ grade: value, label: gradeLabel }) => (
            <button
              key={value}
              type="button"
              aria-pressed={selfGrade === value}
              onClick={() => onSelfGrade(value)}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1 text-sm",
                selfGrade === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {gradeLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A part's outcome as a coloured badge. */
function OutcomeBadge({ outcome }: { outcome: PartOutcome }) {
  const style: Record<PartOutcome, { label: string; className: string }> = {
    exact: {
      label: "matches ✓",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    },
    overlap: {
      label: "overlaps ✓",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    },
    match: {
      label: "match ✓",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    },
    partial: { label: "partial", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
    miss: { label: "no match ✗", className: "bg-red-500/15 text-red-800 dark:text-red-300" },
    unanswered: { label: "left blank", className: "bg-red-500/15 text-red-800 dark:text-red-300" },
    ungraded: { label: "grade it", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = style[outcome];
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", className)}>{label}</span>
  );
}

/** The reference clause tree for a gnarly sentence, as a nested outline. */
function ClauseTreeView({ root }: { root: ClauseNode }) {
  return (
    <details className="mt-1 rounded-md border bg-muted/40 px-3 py-2">
      <summary className="cursor-pointer font-medium text-sm">
        Clause structure (gnarly sentence)
      </summary>
      <div className="mt-2">
        <ClauseNodeView node={root} />
      </div>
    </details>
  );
}

function ClauseNodeView({ node }: { node: ClauseNode }) {
  return (
    <ul className="border-muted-foreground/30 border-l pl-3">
      <li className="text-sm">
        <span className="font-serif">{node.label}</span>
        {node.children?.map((child, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a clause tree is a fixed, ordered structure
          <ClauseNodeView key={i} node={child} />
        ))}
      </li>
    </ul>
  );
}
