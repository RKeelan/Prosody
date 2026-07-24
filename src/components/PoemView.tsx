/**
 * The poem renderer: the one custom token-based component every activity draws
 * the poem with.
 *
 * Each token is its own element—word tokens are buttons, punctuation is inert—
 * and every interaction is reported as a token index, never as a character
 * offset or a DOM range. Browser text selection is switched off outright
 * (Vision.md: native selection handles fight tapping on touch), so the only way
 * to form a span here is the tap state machine in `@/lib/selection`.
 *
 * The component holds no state. Selection, annotation layers, and what a tap
 * means all arrive as props, so Activity 2 can tap syllables and Activity 5 can
 * tap single words without this file learning about either.
 */

import { type CSSProperties, useMemo } from "react";
import { gutterLabel, layOutPoem } from "@/lib/poemLayout";
import { isTokenSelected, type Selection } from "@/lib/selection";
import { isWordToken, type TokenisedPoem } from "@/lib/tokenise";
import { cn } from "@/lib/utils";

interface PoemViewProps {
  /** The poem, tokenised once by the caller and reused across renders. */
  tokenised: TokenisedPoem;
  /** The current selection; `EMPTY_SELECTION` renders the poem unhighlighted. */
  selection: Selection;
  /**
   * Called with a word token's index when the learner taps it. Omit it to
   * render the poem inert—every token a plain span, no hover, no hit target.
   * That is the right reading for an activity that shows the poem without
   * selecting in it, where tappable words would promise an interaction that
   * does nothing.
   */
  onTapToken?: (index: number) => void;
  /**
   * The tint for a token some layer covers—Activity 1's annotation layers
   * today, Activity 6's device palette or Activity 8's allusions later.
   * Deliberately an opaque {@link TokenTint} rather than any one activity's
   * vocabulary: this component composes tints, it does not know what they mean.
   * The selection outranks whatever this returns.
   */
  tokenTint?: (index: number) => TokenTint | undefined;
}

/**
 * How a token is tinted. A background class, plus an optional `box-shadow` for
 * underline strips a static class cannot compose, plus a gap-fill key.
 */
export interface TokenTint {
  /** Background/utility classes for the token. */
  readonly className?: string;
  /** Inline `box-shadow`—the stacked underlines a class string cannot express. */
  readonly boxShadow?: string;
  /**
   * Gap-fill identity: the space before a token joins the tint only where its
   * neighbour shares this key, so a run reads unbroken without bleeding past
   * either end. Defaults to {@link className}—enough whenever the classes alone
   * capture the tint.
   */
  readonly key?: string;
}

export function PoemView({ tokenised, selection, onTapToken, tokenTint }: PoemViewProps) {
  const stanzas = useMemo(() => layOutPoem(tokenised), [tokenised]);
  const pendingAnchor = selection.phase === "anchored" ? selection.anchor : null;

  /**
   * A token's tint: the selection if it covers the token, otherwise whatever
   * the caller's layers supply. Selection wins the background because it is
   * transient—the layer's tint reappears the moment the selection moves on.
   */
  const tintOf = (index: number): TokenTint | undefined =>
    isTokenSelected(selection, index) ? SELECTED_TINT : tokenTint?.(index);

  return (
    // `select-none` and the touch-callout reset keep the browser's own text
    // selection and the iOS long-press menu out of the way; `touch-manipulation`
    // drops the double-tap-to-zoom delay so taps feel immediate.
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
              {/* `whitespace-pre-wrap` keeps a line's own indentation while still
                  letting a long line wrap at phone width. Each gap stays its own
                  element rather than joining a token, so the line still has a
                  break opportunity between every pair of tokens. */}
              <p className="min-w-0 flex-1 whitespace-pre-wrap font-serif text-lg leading-loose">
                {line.tokens.map(({ token, gapBefore }, position) => {
                  const own = tintOf(token.index);
                  // The gap takes the tint only when the tokens on both sides
                  // share it, so a span's tint—background and underlines alike—
                  // runs unbroken through it without bleeding past either end.
                  const previous = position === 0 ? undefined : tintOf(token.index - 1);
                  const ownKey = tintKey(own);
                  const gapFilled = ownKey !== undefined && ownKey === tintKey(previous);
                  const isPending = token.index === pendingAnchor;
                  const tokenClass = cn(
                    "inline-block rounded-sm px-0.5 py-1.5 align-baseline",
                    isPending ? PENDING_CLASS : own?.className,
                  );
                  const tokenStyle = isPending ? undefined : tintStyle(own);

                  return (
                    <span key={token.index}>
                      {gapBefore && (
                        <span
                          className={cn("inline-block py-1.5", gapFilled && own?.className)}
                          style={gapFilled ? tintStyle(own) : undefined}
                        >
                          {gapBefore}
                        </span>
                      )}
                      {onTapToken && isWordToken(token) ? (
                        <button
                          type="button"
                          aria-pressed={isTokenSelected(selection, token.index)}
                          onClick={() => onTapToken(token.index)}
                          style={tokenStyle}
                          className={cn(
                            tokenClass,
                            // A word this narrow ("a", "I") would otherwise be
                            // a target too small to hit reliably with a thumb.
                            "min-w-6 cursor-pointer",
                            // Hover feedback only where it has no highlight to
                            // overwrite—on a selected or marked token it reads
                            // as the highlight vanishing under the pointer.
                            own === undefined && "hover:bg-accent",
                          )}
                        >
                          {token.text}
                        </button>
                      ) : (
                        <span className={tokenClass} style={tokenStyle}>
                          {token.text}
                        </span>
                      )}
                    </span>
                  );
                })}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A token's inline style: the underline strips, when it has any. */
function tintStyle(tint: TokenTint | undefined): CSSProperties | undefined {
  return tint?.boxShadow ? { boxShadow: tint.boxShadow } : undefined;
}

/** A tint's gap-fill identity: its explicit key, or its classes when it has none. */
function tintKey(tint: TokenTint | undefined): string | undefined {
  return tint === undefined ? undefined : (tint.key ?? tint.className);
}

const SELECTED_CLASS = "bg-primary/20 ring-1 ring-primary/70";

/** The transient selection tint, outranking any layer where the two coincide. */
const SELECTED_TINT: TokenTint = { className: SELECTED_CLASS };

/**
 * The half-formed selection: one token anchored, waiting for the tap that
 * closes the span. A dashed outline rather than the solid ring, so "I have
 * started a span" never looks like "I have finished one". It must be an
 * outline: a ring is a box-shadow, and box-shadows have no dashed style.
 */
const PENDING_CLASS = "bg-primary/20 outline-2 outline-primary outline-dashed outline-offset-1";
