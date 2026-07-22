/**
 * Activity 2: read aloud.
 *
 * Two phases over one poem. Phase 1 is bare text—Vision.md is explicit that the
 * read-aloud screen starts bare, so unlike the span-select activities this one
 * carries no Activity 1 annotation layer. The learner does the whole of the
 * scansion by hand: tap a word to open it in a focus sheet, divide it into
 * syllables by tapping between its letters, and mark each syllable's stress. No
 * word is pre-divided and no count is offered, because syllabification—elision,
 * expansion, is-this-one-syllable-or-two—is itself part of the skill; deciding to
 * split "traveller" into two versus three is the learner's elision judgment.
 * Rhyme letters are painted onto line ends with an active "pen".
 *
 * Phase 2, on commit, reveals the reference: the metre named, each word's
 * reference division and stress over the learner's with mismatches flagged and a
 * wrong division called out, the rhyme scheme colour-coded by its true partition,
 * and every deviation with its note. Committing is irreversible within the
 * attempt (the store enforces it); the answer lives in the store, written through
 * on every tap. The answer shape and edits live in `@/lib/scansionAnswer`, the
 * grading in `@/lib/scansionGrade`, leaving this component a projection of those.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { Button } from "@/components/ui/button";
import { resolveAnchor } from "@/lib/anchor";
import type { Pack } from "@/lib/pack";
import { gutterLabel, layOutPoem } from "@/lib/poemLayout";
import {
  coerceScansionAnswer,
  cycleSegmentStress,
  type ScansionAnswer,
  type StressMark,
  segmentsOf,
  splitFor,
  toggleBreak,
  toggleRhyme,
  type WordSplit,
  wordProgress,
} from "@/lib/scansionAnswer";
import {
  type CellGrade,
  gradeRhyme,
  gradeStress,
  type ReferenceWord,
  referenceWords,
  stressAgreement,
  type WordGrade,
} from "@/lib/scansionGrade";
import { spanText } from "@/lib/selection";
import type { SessionStoreState } from "@/lib/session";
import { poemSyllables, resolveSyllabifications } from "@/lib/syllables";
import { isWordToken, type TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface ReadAloudActivityProps {
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

/** The scansion glyphs: an ictus for a stress, a breve for a slack syllable. */
const STRESS_GLYPH = "/";
const UNSTRESS_GLYPH = "˘";

function glyphFor(mark: StressMark): string {
  if (mark === "stressed") return STRESS_GLYPH;
  if (mark === "unstressed") return UNSTRESS_GLYPH;
  return "";
}

/** Distinct tints for the rhyme partition on reveal; cycled if a poem out-groups them. */
const RHYME_GROUP_CLASSES = [
  "bg-sky-200 text-sky-950 dark:bg-sky-500/30 dark:text-sky-50",
  "bg-amber-200 text-amber-950 dark:bg-amber-500/30 dark:text-amber-50",
  "bg-emerald-200 text-emerald-950 dark:bg-emerald-500/30 dark:text-emerald-50",
  "bg-violet-200 text-violet-950 dark:bg-violet-500/30 dark:text-violet-50",
  "bg-rose-200 text-rose-950 dark:bg-rose-500/30 dark:text-rose-50",
  "bg-teal-200 text-teal-950 dark:bg-teal-500/30 dark:text-teal-50",
  "bg-orange-200 text-orange-950 dark:bg-orange-500/30 dark:text-orange-50",
  "bg-fuchsia-200 text-fuchsia-950 dark:bg-fuchsia-500/30 dark:text-fuchsia-50",
];

/** The distinct rhyme letters a restored answer already uses, sorted; ["A"] when none. */
function restoredLetters(raw: unknown): string[] {
  const rhyme = (raw as { rhyme?: unknown } | null | undefined)?.rhyme;
  if (!Array.isArray(rhyme)) return ["A"];
  const found = [...new Set(rhyme.filter((x): x is string => typeof x === "string"))].sort();
  return found.length > 0 ? found : ["A"];
}

export function ReadAloudActivity({ pack, tokenised, store }: ReadAloudActivityProps) {
  const scansion = pack.scansion;

  const committed = useStore(store, (s) => s.session.currentAttempt.activities.scansion.committed);
  const rawAnswers = useStore(store, (s) => s.session.currentAttempt.activities.scansion.answers);
  const actions = useStore(store, (s) => s.actions);

  // Which word the focus sheet is editing, and the rhyme "pen"—all view state.
  // The palette is seeded from any restored answer so a reload mid-pass still
  // offers the letters already in play. Every hook runs before the early return.
  const [focusedToken, setFocusedToken] = useState<number | null>(null);
  const [letters, setLetters] = useState<string[]>(() => restoredLetters(rawAnswers));
  const [pen, setPen] = useState<string>(() => letters[letters.length - 1]);

  const wordTokens = useMemo(() => tokenised.tokens.filter(isWordToken), [tokenised]);
  const wordLengths = useMemo(
    () => new Map(wordTokens.map((t) => [t.index, t.text.length])),
    [wordTokens],
  );
  const lineCount = tokenised.lines.length;

  const answer = useMemo(
    () => coerceScansionAnswer(rawAnswers, wordLengths, lineCount),
    [rawAnswers, wordLengths, lineCount],
  );

  const stanzas = useMemo(() => layOutPoem(tokenised), [tokenised]);

  // The reference only matters once committed—resolving it earlier would be
  // waste, and it never leaks into phase 1's bare text.
  const reference = useMemo(() => {
    if (!committed || !scansion) return null;
    const lineSyllables = poemSyllables(
      tokenised,
      resolveSyllabifications(tokenised.tokens, pack.poem.syllabifications),
    );
    const words = referenceWords(lineSyllables, scansion.lines);
    return { byToken: new Map(words.map((w) => [w.tokenIndex, w])), words };
  }, [committed, scansion, tokenised, pack.poem.syllabifications]);

  const stressGrade = useMemo(
    () => (reference ? gradeStress(reference.words, answer) : null),
    [reference, answer],
  );
  const gradeByToken = useMemo(
    () => new Map((stressGrade?.words ?? []).map((w) => [w.tokenIndex, w])),
    [stressGrade],
  );
  const rhymeGrade = useMemo(
    () =>
      committed && scansion && scansion.rhyme.length > 0
        ? gradeRhyme(scansion.rhyme, answer.rhyme, lineCount)
        : null,
    [committed, scansion, answer.rhyme, lineCount],
  );

  const deviations = useMemo(
    () =>
      (scansion?.deviations ?? []).map((d) => {
        const result = resolveAnchor(tokenised.tokens, d.anchor);
        const quote =
          result.status === "resolved"
            ? spanText(result.span, tokenised.lines, tokenised.tokens)
            : d.anchor.exact;
        return { quote, note: d.note };
      }),
    [scansion, tokenised],
  );

  // Defensive: a pack with Activity 2 enabled always carries scansion (the
  // validator enforces it), so render the poem plainly rather than crash.
  if (!scansion) {
    return (
      <ActivityCard description="This poem has no scansion data.">
        <p className="text-muted-foreground text-sm">Nothing to read aloud here.</p>
      </ActivityCard>
    );
  }

  const editAnswer = (next: ScansionAnswer) => {
    if (committed) return;
    actions.recordAnswers("scansion", next);
  };

  const addLetter = () => {
    if (letters.length >= lineCount) return;
    const next = String.fromCharCode(65 + letters.length);
    setLetters([...letters, next]);
    setPen(next);
  };

  const commit = () => {
    const lineSyllables = poemSyllables(
      tokenised,
      resolveSyllabifications(tokenised.tokens, pack.poem.syllabifications),
    );
    const grade = gradeStress(referenceWords(lineSyllables, scansion.lines), answer);
    actions.commitActivity("scansion", { total: grade.total, correct: grade.correct });
    setFocusedToken(null);
  };

  const progress = wordProgress(answer, wordTokens.length);
  const rhymeAssigned = answer.rhyme.filter((r) => r !== null).length;
  const showRhyme = scansion.rhyme.length > 0;
  const focusedText =
    focusedToken === null ? null : (wordTokens.find((t) => t.index === focusedToken)?.text ?? null);

  return (
    <ActivityCard description="Read the poem aloud. Tap a word to divide it into syllables and mark each one's stress, then give every line's ending a rhyme letter. Commit to reveal the reference scansion beside your own.">
      <div className="flex flex-col gap-4">
        {!committed && (
          <p className="text-muted-foreground text-sm">
            The mark above a syllable cycles as you tap it:{" "}
            <span className="font-medium text-primary">{STRESS_GLYPH}</span> stressed,{" "}
            <span className="font-medium text-primary">{UNSTRESS_GLYPH}</span> slack, blank for
            unmarked.
          </p>
        )}
        {/* The poem. Phase 1 shows the learner's own divisions and marks; phase 2
            shows the reference over them. Punctuation and spacing stay as set. */}
        <div className="touch-manipulation select-none [-webkit-touch-callout:none]">
          {stanzas.map((stanza) => (
            <div key={stanza.stanzaIndex} className="mb-6 last:mb-0">
              {stanza.lines.map((line) => (
                <div key={line.lineIndex} className="flex items-baseline gap-1">
                  <span
                    aria-hidden="true"
                    className="w-5 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums"
                  >
                    {gutterLabel(line.number)}
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap font-serif text-lg leading-loose">
                    {line.tokens.map(({ token, gapBefore }) => {
                      if (!isWordToken(token)) {
                        return (
                          <span key={token.index}>
                            {gapBefore}
                            {token.text}
                          </span>
                        );
                      }
                      const split = splitFor(answer, token.index);
                      return (
                        <span key={token.index}>
                          {gapBefore}
                          {committed ? (
                            <RevealWord
                              reference={reference?.byToken.get(token.index)}
                              grade={gradeByToken.get(token.index)}
                              learner={split}
                              fallbackText={token.text}
                            />
                          ) : (
                            <MarkWord
                              text={token.text}
                              split={split}
                              focused={focusedToken === token.index}
                              onFocus={() => setFocusedToken(token.index)}
                            />
                          )}
                        </span>
                      );
                    })}
                    {showRhyme &&
                      (committed ? (
                        <RevealRhyme
                          letter={answer.rhyme[line.lineIndex]}
                          group={rhymeGrade?.referenceGroupOf[line.lineIndex] ?? -1}
                          correct={rhymeGrade?.lineCorrect[line.lineIndex] ?? false}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Rhyme for line ${line.lineIndex + 1}: ${answer.rhyme[line.lineIndex] ?? "unassigned"}. Tap to paint ${pen}.`}
                          onClick={() => editAnswer(toggleRhyme(answer, line.lineIndex, pen))}
                          className={cn(
                            "ml-2 inline-flex h-6 min-w-6 cursor-pointer select-none items-center justify-center rounded-full border px-1.5 align-middle font-mono text-xs hover:bg-accent",
                            answer.rhyme[line.lineIndex] ? "bg-accent" : "text-muted-foreground",
                          )}
                        >
                          {answer.rhyme[line.lineIndex] ?? "·"}
                        </button>
                      ))}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {committed ? (
          <RevealPanel
            metreName={scansion.metreName}
            agreement={stressGrade ? stressAgreement(stressGrade) : 0}
            correct={stressGrade?.correct ?? 0}
            total={stressGrade?.total ?? 0}
            rhymeMatches={rhymeGrade?.matches ?? null}
            deviations={deviations}
            contested={scansion.elisionQuestions.map((q) => ({
              word: q.anchor.exact,
              metreCount: q.syllableCount.answer,
              alternates: q.syllableCount.alternates,
            }))}
          />
        ) : focusedToken !== null && focusedText !== null ? (
          <FocusSheet
            text={focusedText}
            split={splitFor(answer, focusedToken)}
            onToggleBreak={(pos) => editAnswer(toggleBreak(answer, focusedToken, pos))}
            onCycleStress={(seg) => editAnswer(cycleSegmentStress(answer, focusedToken, seg))}
            onDone={() => setFocusedToken(null)}
          />
        ) : (
          <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
            {showRhyme && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-sm">Rhyme pen:</span>
                {letters.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={l === pen}
                    onClick={() => setPen(l)}
                    className={cn(
                      "h-8 w-8 cursor-pointer rounded-md border font-mono text-sm",
                      l === pen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {l}
                  </button>
                ))}
                {letters.length < lineCount && (
                  <button
                    type="button"
                    aria-label="Add a rhyme letter"
                    onClick={addLetter}
                    className="h-8 w-8 cursor-pointer rounded-md border text-muted-foreground hover:bg-accent"
                  >
                    +
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm tabular-nums">
                {progress.marked}/{progress.total} words marked
                {showRhyme && ` · ${rhymeAssigned}/${lineCount} line ends`}
              </p>
              <Button onClick={commit}>Commit and reveal the scansion</Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Tap a word to divide and stress it. Committing is final for this attempt—the reference
              stays hidden until you do.
            </p>
          </div>
        )}
      </div>
    </ActivityCard>
  );
}

interface MarkWordProps {
  text: string;
  split: WordSplit;
  focused: boolean;
  onFocus: () => void;
}

/** A word in phase 1: the learner's current syllables and stress marks, tap to focus. */
function MarkWord({ text, split, focused, onFocus }: MarkWordProps) {
  const segments = segmentsOf(text, split.breaks);
  return (
    <button
      type="button"
      onClick={onFocus}
      aria-label={`${text}: ${segments.length} syllable(s). Tap to divide and stress.`}
      className={cn(
        "inline-flex cursor-pointer items-baseline whitespace-nowrap rounded-sm align-baseline hover:bg-accent",
        focused && "bg-accent ring-1 ring-primary/60",
      )}
    >
      {segments.map((segment, si) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: syllables have no id but a stable position
          key={si}
          className={cn(
            "relative inline-block px-0.5 pt-4",
            si > 0 && "ml-px border-l border-dashed border-muted-foreground/40 pl-1",
            split.stress[si] === "stressed" && "font-semibold",
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 text-center text-primary text-xs leading-none"
          >
            {glyphFor(split.stress[si] ?? null)}
          </span>
          {segment}
        </span>
      ))}
    </button>
  );
}

interface RevealWordProps {
  reference: ReferenceWord | undefined;
  grade: WordGrade | undefined;
  learner: WordSplit;
  fallbackText: string;
}

/** A word on reveal: the reference division and marks, tinted by the learner's outcome. */
function RevealWord({ reference, grade, learner, fallbackText }: RevealWordProps) {
  if (!reference || !grade) return <span>{fallbackText}</span>;
  const learnerSegments = segmentsOf(reference.text, learner.breaks);
  return (
    <span className="inline-flex flex-col items-center align-baseline">
      <span className="inline-flex items-baseline whitespace-nowrap">
        {reference.syllables.map((syllable, si) => {
          const cell: CellGrade = grade.cells[si] ?? "unmarked";
          const tint =
            cell === "correct"
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : cell === "mismatch"
                ? "bg-red-500/15 text-red-800 dark:text-red-300"
                : "bg-muted/50 text-muted-foreground";
          const learnerMark = grade.splitCorrect
            ? learner.stress[si] === null
              ? "–"
              : glyphFor(learner.stress[si] ?? null)
            : "";
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: syllables have no id but a stable position
              key={si}
              className={cn(
                "relative inline-block px-0.5 pt-4 pb-3",
                si > 0 && "ml-px border-l border-dashed border-muted-foreground/40 pl-1",
                tint,
              )}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 text-center text-primary text-xs leading-none"
              >
                {glyphFor(reference.stress[si]?.answer ?? null)}
              </span>
              {syllable}
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 text-center text-[0.65rem] leading-none",
                  cell === "mismatch" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                )}
              >
                {learnerMark}
              </span>
            </span>
          );
        })}
      </span>
      {!grade.splitCorrect && (
        <span className="text-[0.6rem] text-red-600 leading-none dark:text-red-400">
          you split {learnerSegments.join("·")}
        </span>
      )}
    </span>
  );
}

interface RevealRhymeProps {
  letter: string | null;
  group: number;
  correct: boolean;
}

/** A line-end rhyme chip on reveal: coloured by its reference group, ✓/✗ against the learner. */
function RevealRhyme({ letter, group, correct }: RevealRhymeProps) {
  return (
    <span
      className={cn(
        "ml-2 inline-flex select-none items-center gap-1 rounded-full px-2 py-0.5 align-middle font-mono text-xs",
        group >= 0 ? RHYME_GROUP_CLASSES[group % RHYME_GROUP_CLASSES.length] : "bg-muted",
      )}
      title={correct ? "Grouping matches the reference" : "Grouping differs from the reference"}
    >
      <span>{letter ?? "·"}</span>
      <span aria-hidden="true">{correct ? "✓" : "✗"}</span>
    </span>
  );
}

interface FocusSheetProps {
  text: string;
  split: WordSplit;
  onToggleBreak: (position: number) => void;
  onCycleStress: (segment: number) => void;
  onDone: () => void;
}

/** The focus sheet: divide the word between its letters, then stress each syllable. */
function FocusSheet({ text, split, onToggleBreak, onCycleStress, onDone }: FocusSheetProps) {
  const letters = [...text];
  const segments = segmentsOf(text, split.breaks);
  return (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          Tap between letters to divide; tap a syllable to cycle its stress ({STRESS_GLYPH}{" "}
          stressed, {UNSTRESS_GLYPH} slack).
        </span>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>

      {/* Split row: letters with a toggle slot between each pair. */}
      <div className="flex flex-wrap items-center justify-center font-serif text-2xl">
        {letters.map((ch, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: letters are positional
          <span key={i} className="inline-flex items-center">
            {i > 0 && (
              <button
                type="button"
                aria-label={
                  split.breaks.includes(i) ? "Remove syllable break" : "Add a syllable break"
                }
                onClick={() => onToggleBreak(i)}
                className={cn(
                  "mx-0.5 h-9 w-4 cursor-pointer rounded text-base",
                  split.breaks.includes(i)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground/40 hover:bg-accent",
                )}
              >
                {split.breaks.includes(i) ? "|" : "·"}
              </button>
            )}
            <span>{ch}</span>
          </span>
        ))}
      </div>

      {/* Stress row: one button per syllable, tap to cycle its mark. */}
      <div className="flex flex-wrap items-end justify-center gap-2">
        {segments.map((segment, si) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: syllables are positional
            key={si}
            type="button"
            aria-label={`${segment}: ${split.stress[si] ?? "unmarked"}`}
            onClick={() => onCycleStress(si)}
            className={cn(
              "relative cursor-pointer rounded-md border px-3 pt-5 pb-1 font-serif text-lg hover:bg-accent",
              split.stress[si] === "stressed" && "border-primary bg-primary/15 font-semibold",
            )}
          >
            <span className="absolute inset-x-0 top-1 text-center text-primary text-sm leading-none">
              {glyphFor(split.stress[si] ?? null)}
            </span>
            {segment}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RevealPanelProps {
  metreName: string;
  agreement: number;
  correct: number;
  total: number;
  rhymeMatches: boolean | null;
  deviations: readonly { quote: string; note: string }[];
  contested: readonly { word: string; metreCount: number; alternates: readonly number[] }[];
}

/** The post-commit reference: metre, agreement, rhyme verdict, contested counts, deviations. */
function RevealPanel({
  metreName,
  agreement,
  correct,
  total,
  rhymeMatches,
  deviations,
  contested,
}: RevealPanelProps) {
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">Metre: </span>
          <span className="font-medium">{metreName}</span>
        </p>
        <p className="text-sm tabular-nums">
          <span className="text-muted-foreground">Stress agreement: </span>
          <span className="font-medium">
            {agreement}% ({correct}/{total})
          </span>
        </p>
        {rhymeMatches !== null && (
          <p className="text-sm">
            <span className="text-muted-foreground">Rhyme scheme: </span>
            <span className="font-medium">
              {rhymeMatches ? "matches the reference" : "differs from the reference"}
            </span>
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Above each syllable is the reference mark ({STRESS_GLYPH} stressed, {UNSTRESS_GLYPH} slack);
        below it is your own. Green agrees, red differs, grey went unmarked; a word you divided
        differently is flagged with the split you made.
      </p>

      {contested.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-medium text-sm">Contested syllable counts</h3>
          {contested.map((c) => (
            <p key={c.word} className="text-muted-foreground text-sm">
              <span className="font-serif italic">{c.word}</span> — the metre takes {c.metreCount}
              {c.alternates.length > 0
                ? ` (${[c.metreCount, ...c.alternates].sort((a, b) => a - b).join(" or ")} both scan)`
                : ""}
              .
            </p>
          ))}
        </section>
      )}

      {deviations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">Deviations from the base metre</h3>
          <ul className="flex flex-col gap-2">
            {deviations.map((d) => (
              <li key={`${d.quote}:${d.note}`} className="text-sm">
                <span className="font-serif italic">“{d.quote}”</span>
                <span className="text-muted-foreground"> — {d.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
