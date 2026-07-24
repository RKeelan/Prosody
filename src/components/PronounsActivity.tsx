/**
 * Activity 3: resolve pronouns and demonstratives.
 *
 * Vision.md: for every *this*, *that*, *it*, *he/she/they*, name the antecedent
 * precisely. The target pronouns are highlighted in the poem as chips; one is
 * always active, and the learner answers it either by tapping its antecedent
 * span in the poem or by typing an implied/extratextual referent. A meter counts
 * how many of the M pronouns are resolved.
 *
 * The withholding principle holds here as everywhere: the reference antecedents
 * stay hidden until commit. On commit the two answer routes grade the two ways
 * `@/lib/pronounGrade` prescribes—span answers auto-checked exact/overlap against
 * the reference spans (alternates accepted where the ambiguity is the poem's
 * point), typed answers revealed beside the reference for the learner to self-
 * grade match/partial/miss. Misses (a span that matched nothing, a self-graded
 * miss, a pronoun left unresolved) feed the Activity 9 gate.
 *
 * $Claude Self-grades are post-commit decisions, so they cannot live in the
 * frozen answer payload; they are React state, written through to the store as
 * the derived score and miss list (`setMisses` replaces the list wholesale so a
 * reconsidered grade can drop a miss). On a reload after self-grading, the
 * grades are reconstructed from the persisted miss list—a typed answer with a
 * miss reads back as "miss", one without as "match", so a `partial` softens to
 * "match" across a reload. The common flow (commit, self-grade, review, no
 * reload) is exact; the reload seam is a documented, low-stakes approximation.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { PoemView } from "@/components/PoemView";
import { Button } from "@/components/ui/button";
import { resolveAnchor } from "@/lib/anchor";
import type { AnswerTarget, Pack } from "@/lib/pack";
import {
  answeredCount,
  clearResponse,
  coercePronounAnswer,
  emptyPronounAnswer,
  type PronounResponse,
  responseFor,
  withSpanResponse,
  withTextResponse,
} from "@/lib/pronounAnswer";
import {
  gradePronouns,
  type PronounOutcome,
  type ReferenceAntecedent,
  resolveAntecedent,
  type SelfGrade,
} from "@/lib/pronounGrade";
import {
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

interface PronounsActivityProps {
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

/** The pronoun highlight in the poem: a resting tint, and a stronger one for the active chip. */
const PRONOUN_CLASS = "bg-teal-200/80 dark:bg-teal-400/25";
const PRONOUN_ACTIVE_CLASS =
  "bg-teal-300 ring-1 ring-teal-600 dark:bg-teal-400/50 dark:ring-teal-300";

/** Each self-grade's short label, in the order they read as match → partial → miss. */
const SELF_GRADES: readonly { grade: SelfGrade; label: string }[] = [
  { grade: "match", label: "Match" },
  { grade: "partial", label: "Partial" },
  { grade: "miss", label: "Miss" },
];

/** One reference target rendered as text: a span quoted from the poem, or the typed referent. */
function targetText(target: AnswerTarget, tokenised: TokenisedPoem): string {
  if (target.kind === "text") return target.text;
  const result = resolveAnchor(tokenised.tokens, target.anchor);
  return result.status === "resolved"
    ? spanText(result.span, tokenised.lines, tokenised.tokens)
    : target.anchor.exact;
}

/** The learner's answer as a short readout: the highlighted span, the typed text, or nothing. */
function responseText(
  response: PronounResponse | undefined,
  tokenised: TokenisedPoem,
): string | null {
  if (!response) return null;
  return response.kind === "span"
    ? spanText(response.span, tokenised.lines, tokenised.tokens)
    : response.text;
}

/** The one-line miss description the Activity 9 gate shows for a missed pronoun. */
function missDescription(pronoun: string, outcome: PronounOutcome): string {
  const reason = outcome === "unanswered" ? "left unresolved" : "antecedent missed";
  return `“${pronoun}” — ${reason}`;
}

export function PronounsActivity({ pack, tokenised, store }: PronounsActivityProps) {
  const pronouns = pack.pronouns ?? [];

  const committed = useStore(store, (s) => s.session.currentAttempt.activities.pronouns.committed);
  const rawAnswers = useStore(store, (s) => s.session.currentAttempt.activities.pronouns.answers);
  const storedMisses = useStore(store, (s) => s.session.currentAttempt.activities.pronouns.misses);
  const actions = useStore(store, (s) => s.actions);

  // Each pronoun's location in the poem, and a token→pronoun lookup so a tap on a
  // highlighted pronoun activates it rather than extending an antecedent span.
  const located = useMemo(() => {
    const spans = pronouns.map((p) => {
      const result = resolveAnchor(tokenised.tokens, p.pronoun);
      return result.status === "resolved" ? result.span : null;
    });
    const tokenToPronoun = new Map<number, number>();
    spans.forEach((span, i) => {
      if (!span) return;
      for (let t = span.start; t < span.end; t++) tokenToPronoun.set(t, i);
    });
    const texts = spans.map((span, i) =>
      span ? spanText(span, tokenised.lines, tokenised.tokens) : pronouns[i].pronoun.exact,
    );
    // A stable list key per pronoun: its first token index is unique across
    // pronouns; only an unresolvable anchor (a broken pack) falls back to text.
    const keys = spans.map((span, i) =>
      span ? `t${span.start}` : `u-${pronouns[i].pronoun.exact}`,
    );
    return { texts, keys, tokenToPronoun };
  }, [pronouns, tokenised]);

  const references = useMemo<ReferenceAntecedent[]>(
    () => pronouns.map((p) => resolveAntecedent(tokenised.tokens, p.antecedent)),
    [pronouns, tokenised],
  );

  const answer = useMemo(
    () => (rawAnswers ? coercePronounAnswer(rawAnswers, pronouns.length) : emptyPronounAnswer()),
    [rawAnswers, pronouns.length],
  );

  const [active, setActive] = useState(0);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [draft, setDraft] = useState("");

  // Reconstruct self-grades from the persisted miss list on a fresh mount that is
  // already committed (a reload, or stepping back to this activity). See the
  // module note: a typed answer with a miss reads back "miss", one without "match".
  const [selfGrades, setSelfGrades] = useState<Record<number, SelfGrade>>(() => {
    if (!committed) return {};
    const seed: Record<number, SelfGrade> = {};
    pronouns.forEach((_, i) => {
      if (responseFor(answer, i)?.kind !== "text") return;
      seed[i] = storedMisses.some((m) => m.id === `pronoun-${i}`) ? "miss" : "match";
    });
    return seed;
  });

  const grade = useMemo(
    () => gradePronouns(references, answer, selfGrades),
    [references, answer, selfGrades],
  );

  if (pronouns.length === 0) {
    return (
      <ActivityCard description="This poem has no pronouns to resolve.">
        <p className="text-muted-foreground text-sm">Nothing to resolve here.</p>
      </ActivityCard>
    );
  }

  const activatePronoun = (index: number) => {
    setActive(index);
    setSelection(EMPTY_SELECTION);
    const response = responseFor(answer, index);
    setDraft(response?.kind === "text" ? response.text : "");
  };

  const handleTap = (index: number) => {
    const pronoun = located.tokenToPronoun.get(index);
    if (pronoun !== undefined) {
      activatePronoun(pronoun);
      return;
    }
    setSelection((current) => tapToken(current, index));
  };

  const applySpanAnswer = () => {
    const span = selectionSpan(selection);
    if (!span) return;
    actions.recordAnswers("pronouns", withSpanResponse(answer, active, span));
    setSelection(EMPTY_SELECTION);
  };

  const applyTypedAnswer = () => {
    if (draft.trim().length === 0) return;
    actions.recordAnswers("pronouns", withTextResponse(answer, active, draft));
  };

  const clearActive = () => {
    actions.recordAnswers("pronouns", clearResponse(answer, active));
    setSelection(EMPTY_SELECTION);
    setDraft("");
  };

  const syncGrades = (nextSelfGrades: Record<number, SelfGrade>) => {
    const next = gradePronouns(references, answer, nextSelfGrades);
    actions.setScore("pronouns", { total: next.total, correct: next.correct });
    actions.setMisses(
      "pronouns",
      next.results.flatMap((result, i) =>
        result.miss
          ? [{ id: `pronoun-${i}`, description: missDescription(located.texts[i], result.outcome) }]
          : [],
      ),
    );
  };

  const commit = () => {
    const graded = gradePronouns(references, answer, {});
    actions.commitActivity("pronouns", { total: graded.total, correct: graded.correct });
    syncGrades({});
  };

  const setSelfGrade = (index: number, value: SelfGrade) => {
    const next = { ...selfGrades, [index]: value };
    setSelfGrades(next);
    syncGrades(next);
  };

  if (committed) {
    return (
      <ActivityCard description="The reference antecedents. Your highlighted spans are checked against them; your typed answers sit beside the reference for you to grade. Anything still missed feeds the final gate.">
        <RevealList
          pronouns={pronouns}
          located={located.texts}
          keys={located.keys}
          answer={answer}
          grade={grade}
          selfGrades={selfGrades}
          tokenised={tokenised}
          onSelfGrade={setSelfGrade}
        />
      </ActivityCard>
    );
  }

  const activeResponse = responseFor(answer, active);
  const activeAnswerText = responseText(activeResponse, tokenised);
  const selectedText = selectionText(selection, tokenised.lines, tokenised.tokens);
  const resolved = answeredCount(answer);

  const controls = (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 pt-3 pb-2 backdrop-blur">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground">Antecedent of </span>
          <span className="rounded bg-teal-200/80 px-1.5 py-0.5 font-serif dark:bg-teal-400/25">
            {located.texts[active]}
          </span>
        </p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {resolved}/{pronouns.length} resolved
        </p>
      </div>

      {selection.phase !== "empty" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted-foreground">Selected: </span>
            <span className="font-serif">{selectedText}</span>
            {selection.phase === "anchored" && (
              <span className="text-muted-foreground"> · tap another word to extend</span>
            )}
          </p>
          <Button size="sm" onClick={applySpanAnswer}>
            Use as antecedent
          </Button>
        </div>
      ) : activeAnswerText !== null ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted-foreground">
              Answer ({activeResponse?.kind === "span" ? "highlighted" : "typed"}):{" "}
            </span>
            <span className="font-serif">{activeAnswerText}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={clearActive}>
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Tap the antecedent in the poem, or type an implied one below.
        </p>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applyTypedAnswer();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. (implied) the speaker"
          aria-label={`Type the antecedent of “${located.texts[active]}”`}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={draft.trim().length === 0}>
          Type it
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          Tap a highlighted pronoun to switch. Committing is final for this attempt.
        </p>
        <Button onClick={commit}>Commit and check</Button>
      </div>
    </div>
  );

  return (
    <ActivityCard description="Resolve every pronoun and demonstrative. Tap a highlighted one, then point at its antecedent in the poem or type it. The reference stays hidden until you commit.">
      <div className="flex flex-col gap-4">
        <PoemView
          tokenised={tokenised}
          selection={selection}
          onTapToken={handleTap}
          tokenTint={(index) => {
            const pronoun = located.tokenToPronoun.get(index);
            if (pronoun === undefined) return undefined;
            return { className: pronoun === active ? PRONOUN_ACTIVE_CLASS : PRONOUN_CLASS };
          }}
        />
        {controls}
      </div>
    </ActivityCard>
  );
}

interface RevealListProps {
  pronouns: NonNullable<Pack["pronouns"]>;
  located: readonly string[];
  keys: readonly string[];
  answer: ReturnType<typeof coercePronounAnswer>;
  grade: ReturnType<typeof gradePronouns>;
  selfGrades: Record<number, SelfGrade>;
  tokenised: TokenisedPoem;
  onSelfGrade: (index: number, grade: SelfGrade) => void;
}

/** The post-commit reveal: the score, each pronoun's verdict, and the surviving miss list. */
function RevealList({
  pronouns,
  located,
  keys,
  answer,
  grade,
  selfGrades,
  tokenised,
  onSelfGrade,
}: RevealListProps) {
  const rows = pronouns.map((pronoun, i) => ({ pronoun, index: i, key: keys[i] }));
  const misses = rows.flatMap((row) => (grade.results[row.index].miss ? [row] : []));
  const ungraded = grade.results.filter((r) => r.outcome === "ungraded").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums">
        <p>
          <span className="text-muted-foreground">Resolved: </span>
          <span className="font-medium">
            {grade.correct}/{grade.total}
          </span>
        </p>
        {ungraded > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            {ungraded} typed answer{ungraded === 1 ? "" : "s"} await your self-assessment.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map(({ pronoun, index: i, key }) => {
          const response = responseFor(answer, i);
          const learner = responseText(response, tokenised);
          const outcome = grade.results[i].outcome;
          const reference = [pronoun.antecedent.answer, ...pronoun.antecedent.alternates].map((t) =>
            targetText(t, tokenised),
          );
          return (
            <li key={key} className="flex flex-col gap-2 border-t pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="rounded bg-teal-200/80 px-1.5 py-0.5 font-serif text-sm dark:bg-teal-400/25">
                  {located[i]}
                </span>
                <OutcomeBadge outcome={outcome} />
              </div>

              <p className="text-sm">
                <span className="text-muted-foreground">You said: </span>
                {learner === null ? (
                  <span className="text-muted-foreground italic">left unresolved</span>
                ) : (
                  <span className="font-serif">
                    {learner}
                    <span className="text-muted-foreground">
                      {" "}
                      ({response?.kind === "span" ? "highlighted" : "typed"})
                    </span>
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

              {response?.kind === "text" && (
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

      <section className="flex flex-col gap-2 border-t pt-3">
        <h3 className="font-medium text-sm">Miss list</h3>
        {misses.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing missed—every pronoun resolved.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {misses.map(({ index: i, key }) => (
              <li key={key} className="text-sm">
                <span className="font-serif">{located[i]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  —{" "}
                  {grade.results[i].outcome === "unanswered"
                    ? "left unresolved"
                    : "antecedent missed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A pronoun's outcome as a coloured badge. */
function OutcomeBadge({ outcome }: { outcome: PronounOutcome }) {
  const style: Record<PronounOutcome, { label: string; className: string }> = {
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
    unanswered: { label: "unresolved", className: "bg-red-500/15 text-red-800 dark:text-red-300" },
    ungraded: { label: "grade it", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = style[outcome];
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", className)}>{label}</span>
  );
}
