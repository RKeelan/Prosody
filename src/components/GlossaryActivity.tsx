/**
 * Activity 5: gloss the diction.
 *
 * Vision.md, as revised: the interesting part of glossing for a capable reader is
 * not defining ordinary hard words but catching the *loaded words*—the ones the
 * poem uses in two senses at once (Ozymandias's "mocked", "survive", "read"). So
 * the pack's loaded words are highlighted from the start, and for each the learner
 * works out both senses in play. There is no essential-vocabulary coverage check;
 * the loaded words are the whole exercise.
 *
 * The withholding principle holds where it earns its keep: the loaded words are
 * pointed out, but the reference senses stay hidden until commit, so working out
 * the two meanings is the learner's own. On commit each loaded word's two reference
 * senses are shown beside the learner's, self-graded match / partial / miss—the app
 * shows both rather than pretending to judge a definition. See `@/lib/glossaryGrade`
 * for how the loaded words form the score and which outcomes feed the miss list.
 *
 * $Claude Self-grades are post-commit decisions, so—as in Activities 3 and 4—they
 * live in React state, written through to the store as the derived score and miss
 * list, and reconstructed from the persisted miss list on a reload (an addressed
 * word with a stored miss reads back "miss", one without "match", so a `partial`
 * softens to "match" across a reload). Whether a word was addressed is read from
 * the answer, so it survives a reload exactly. The common flow—commit, self-grade,
 * review, no reload—is exact.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { PoemView } from "@/components/PoemView";
import { Button } from "@/components/ui/button";
import {
  clearGloss,
  coerceGlossaryAnswer,
  emptyGlossaryAnswer,
  glossFor,
  setPrimarySense,
  setSecondarySense,
  type WordGloss,
} from "@/lib/glossaryAnswer";
import {
  gradeLoadedWords,
  type LoadedOutcome,
  type LoadedWord,
  resolveLoadedWord,
  type SelfGrade,
  wordAnswered,
} from "@/lib/glossaryGrade";
import type { Pack } from "@/lib/pack";
import { EMPTY_SELECTION, spanText } from "@/lib/selection";
import type { SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface GlossaryActivityProps {
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

/** The tint for a loaded word, and the stronger one for the active word. */
const LOADED_CLASS = "bg-violet-200/70 dark:bg-violet-400/25";
const ACTIVE_CLASS =
  "bg-violet-300 ring-1 ring-violet-600 dark:bg-violet-400/50 dark:ring-violet-300";

/** Each self-grade's short label, match → partial → miss. */
const SELF_GRADES: readonly { grade: SelfGrade; label: string }[] = [
  { grade: "match", label: "Match" },
  { grade: "partial", label: "Partial" },
  { grade: "miss", label: "Miss" },
];

/** A miss's stable id, shared by the store and the reload reconstruction. */
function missId(loadedIndex: number): string {
  return `loaded-${loadedIndex}`;
}

/** The one-line miss the summary shows for a loaded word left unread or misread. */
function missDescription(word: string, outcome: LoadedOutcome): string {
  const reason = outcome === "unanswered" ? "not addressed" : "senses missed";
  return `“${word}” — ${reason}`;
}

/** The learner's reading as a readout: one sense, or two joined; null when unaddressed. */
function glossText(gloss: WordGloss | undefined): string | null {
  if (!gloss) return null;
  return gloss.secondary ? `${gloss.primary}; ${gloss.secondary}` : gloss.primary;
}

export function GlossaryActivity({ pack, tokenised, store }: GlossaryActivityProps) {
  // The activity draws only on the loaded words—the pack's odd-usage entries, each
  // carrying the two senses the poem plays on.
  const loaded = useMemo(() => (pack.glossary ?? []).filter((e) => e.oddUsage), [pack.glossary]);

  const committed = useStore(store, (s) => s.session.currentAttempt.activities.glossary.committed);
  const rawAnswers = useStore(store, (s) => s.session.currentAttempt.activities.glossary.answers);
  const storedMisses = useStore(store, (s) => s.session.currentAttempt.activities.glossary.misses);
  const actions = useStore(store, (s) => s.actions);

  const references = useMemo<LoadedWord[]>(
    () => loaded.map((entry) => resolveLoadedWord(tokenised.tokens, entry)),
    [loaded, tokenised],
  );

  // Each loaded word's readout text and list key, plus a token → loaded-word lookup
  // for the highlight and for routing a tap to the word it lands in. An
  // unresolvable anchor (a broken pack) falls back to the anchor's text; the
  // validator reports it.
  const located = useMemo(() => {
    const texts = references.map((r, i) =>
      r.spans[0] ? spanText(r.spans[0], tokenised.lines, tokenised.tokens) : loaded[i].word.exact,
    );
    const keys = references.map((r, i) => (r.spans[0] ? `t${r.spans[0].start}` : `u-${i}`));
    const tokenToLoaded = new Map<number, number>();
    references.forEach((r, i) => {
      for (const span of r.spans) {
        for (let t = span.start; t < span.end; t++) tokenToLoaded.set(t, i);
      }
    });
    return { texts, keys, tokenToLoaded };
  }, [references, loaded, tokenised]);

  const answer = useMemo(
    () =>
      rawAnswers
        ? coerceGlossaryAnswer(rawAnswers, tokenised.tokens.length)
        : emptyGlossaryAnswer(),
    [rawAnswers, tokenised],
  );

  const [active, setActive] = useState<number | null>(null);
  const [firstDraft, setFirstDraft] = useState("");
  const [secondDraft, setSecondDraft] = useState("");

  // Reconstruct self-grades from the persisted miss list on a committed mount (a
  // reload, or stepping back). Each addressed word reads "miss" when a matching
  // miss is stored, "match" otherwise—see the module note. An unaddressed word
  // needs no self-grade; its miss derives from the answer.
  const [selfGrades, setSelfGrades] = useState<Record<number, SelfGrade>>(() => {
    if (!committed) return {};
    const seed: Record<number, SelfGrade> = {};
    references.forEach((word, i) => {
      if (!wordAnswered(answer, word)) return;
      seed[i] = storedMisses.some((m) => m.id === missId(i)) ? "miss" : "match";
    });
    return seed;
  });

  const grade = useMemo(
    () => gradeLoadedWords(references, answer, selfGrades),
    [references, answer, selfGrades],
  );

  if (loaded.length === 0) {
    return (
      <ActivityCard description="This poem has no loaded words to unpack.">
        <p className="text-muted-foreground text-sm">Nothing to unpack here.</p>
      </ActivityCard>
    );
  }

  /** The token that holds a loaded word's gloss: its first token, or −1 when unresolved. */
  const tokenForLoaded = (index: number): number => references[index].spans[0]?.start ?? -1;

  const activateWord = (loadedIndex: number) => {
    setActive(loadedIndex);
    const gloss = glossFor(answer, tokenForLoaded(loadedIndex));
    setFirstDraft(gloss?.primary ?? "");
    setSecondDraft(gloss?.secondary ?? "");
  };

  const handleTap = (index: number) => {
    const loadedIndex = located.tokenToLoaded.get(index);
    if (loadedIndex !== undefined) activateWord(loadedIndex);
  };

  const saveGloss = () => {
    if (active === null || firstDraft.trim().length === 0) return;
    const token = tokenForLoaded(active);
    if (token < 0) return;
    let next = setPrimarySense(answer, token, firstDraft);
    next = setSecondarySense(next, token, secondDraft);
    actions.recordAnswers("glossary", next);
  };

  const clearActive = () => {
    if (active === null) return;
    actions.recordAnswers("glossary", clearGloss(answer, tokenForLoaded(active)));
    setFirstDraft("");
    setSecondDraft("");
  };

  const syncGrades = (nextSelfGrades: Record<number, SelfGrade>) => {
    const next = gradeLoadedWords(references, answer, nextSelfGrades);
    actions.setScore("glossary", { total: next.total, correct: next.correct });
    actions.setMisses(
      "glossary",
      next.results.flatMap((result, i) =>
        result.miss
          ? [{ id: missId(i), description: missDescription(located.texts[i], result.outcome) }]
          : [],
      ),
    );
  };

  const commit = () => {
    const graded = gradeLoadedWords(references, answer, {});
    actions.commitActivity("glossary", { total: graded.total, correct: graded.correct });
    syncGrades({});
  };

  const setSelfGrade = (index: number, value: SelfGrade) => {
    const next = { ...selfGrades, [index]: value };
    setSelfGrades(next);
    syncGrades(next);
  };

  const tokenTint = (index: number, activeToken: number | null) => {
    const loadedIndex = located.tokenToLoaded.get(index);
    if (loadedIndex === undefined) return undefined;
    return { className: loadedIndex === activeToken ? ACTIVE_CLASS : LOADED_CLASS };
  };

  if (committed) {
    return (
      <ActivityCard description="The reference senses. Each loaded word's two meanings sit beside your reading for you to grade. A word left unaddressed or misread feeds the session summary.">
        <div className="flex flex-col gap-4">
          <PoemView
            tokenised={tokenised}
            selection={EMPTY_SELECTION}
            tokenTint={(index) => tokenTint(index, null)}
          />
          <RevealList
            references={references}
            texts={located.texts}
            keys={located.keys}
            answer={answer}
            grade={grade}
            selfGrades={selfGrades}
            tokenForLoaded={tokenForLoaded}
            onSelfGrade={setSelfGrade}
          />
        </div>
      </ActivityCard>
    );
  }

  const activeGloss = active === null ? undefined : glossFor(answer, tokenForLoaded(active));
  const activeWordText = active === null ? null : located.texts[active];
  const addressed = references.filter((word) => wordAnswered(answer, word)).length;

  const controls = (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {activeWordText !== null ? (
          <p className="text-sm">
            <span className="text-muted-foreground">The two senses of </span>
            <span className="rounded bg-violet-200/80 px-1.5 py-0.5 font-serif dark:bg-violet-400/25">
              {activeWordText}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Tap a highlighted word and work out the two senses it carries at once.
          </p>
        )}
        <p className="text-muted-foreground text-sm tabular-nums">
          {addressed}/{references.length} read
        </p>
      </div>

      {active !== null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveGloss();
          }}
        >
          <input
            value={firstDraft}
            onChange={(e) => setFirstDraft(e.target.value)}
            placeholder="Its first sense"
            aria-label={`First sense of “${activeWordText}”`}
            className="rounded-md border bg-background px-3 py-2 font-serif text-sm"
          />
          {firstDraft.trim().length > 0 && (
            <input
              value={secondDraft}
              onChange={(e) => setSecondDraft(e.target.value)}
              placeholder="Its second sense—the one the poem also plays on"
              aria-label={`Second sense of “${activeWordText}”`}
              className="rounded-md border bg-background px-3 py-2 font-serif text-sm"
            />
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={firstDraft.trim().length === 0}>
              Save
            </Button>
            {activeGloss && (
              <Button type="button" variant="ghost" size="sm" onClick={clearActive}>
                Clear
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              A loaded word carries two senses at once—give both.
            </span>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          Tap a highlighted word to read it. Committing is final for this attempt.
        </p>
        <Button onClick={commit}>Commit and check</Button>
      </div>
    </div>
  );

  return (
    <ActivityCard description="The poem's loaded words are highlighted—each carries two senses at once. Tap one and work out both meanings in play. The reference stays hidden until you commit.">
      <div className="flex flex-col gap-4">
        <PoemView
          tokenised={tokenised}
          selection={EMPTY_SELECTION}
          onTapToken={handleTap}
          tokenTint={(index) => tokenTint(index, active)}
        />
        {controls}
      </div>
    </ActivityCard>
  );
}

interface RevealListProps {
  references: readonly LoadedWord[];
  texts: readonly string[];
  keys: readonly string[];
  answer: ReturnType<typeof coerceGlossaryAnswer>;
  grade: ReturnType<typeof gradeLoadedWords>;
  selfGrades: Record<number, SelfGrade>;
  tokenForLoaded: (index: number) => number;
  onSelfGrade: (index: number, grade: SelfGrade) => void;
}

/** The post-commit reveal: the score, each loaded word's two reference senses, and the self-grade. */
function RevealList({
  references,
  texts,
  keys,
  answer,
  grade,
  selfGrades,
  tokenForLoaded,
  onSelfGrade,
}: RevealListProps) {
  const ungraded = grade.results.filter((r) => r.outcome === "ungraded").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums">
        <p>
          <span className="text-muted-foreground">Loaded words read: </span>
          <span className="font-medium">
            {grade.correct}/{grade.total}
          </span>
        </p>
        {ungraded > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            {ungraded} word{ungraded === 1 ? "" : "s"} await your self-assessment.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-4">
        {references.map((reference, i) => {
          const learner = glossText(glossFor(answer, tokenForLoaded(i)));
          return (
            <li key={keys[i]} className="flex flex-col gap-2 border-t pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="rounded bg-violet-200/80 px-1.5 py-0.5 font-serif text-sm dark:bg-violet-400/25">
                  {texts[i]}
                </span>
                <OutcomeBadge outcome={grade.results[i].outcome} />
              </div>

              <p className="text-sm">
                <span className="text-muted-foreground">You said: </span>
                {learner === null ? (
                  <span className="text-muted-foreground italic">left blank</span>
                ) : (
                  <span className="font-serif">{learner}</span>
                )}
              </p>

              <div className="text-sm">
                <span className="text-muted-foreground">Reference (two senses): </span>
                <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-5 font-serif">
                  {reference.senses.map((sense) => (
                    <li key={sense}>{sense}</li>
                  ))}
                </ol>
              </div>

              {grade.results[i].outcome !== "unanswered" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-sm">Grade yourself:</span>
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A loaded word's outcome as a coloured badge. */
function OutcomeBadge({ outcome }: { outcome: LoadedOutcome }) {
  const style: Record<LoadedOutcome, { label: string; className: string }> = {
    match: {
      label: "match ✓",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    },
    partial: { label: "partial", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
    miss: { label: "no match ✗", className: "bg-red-500/15 text-red-800 dark:text-red-300" },
    unanswered: {
      label: "not addressed",
      className: "bg-red-500/15 text-red-800 dark:text-red-300",
    },
    ungraded: { label: "grade it", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = style[outcome];
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", className)}>{label}</span>
  );
}
