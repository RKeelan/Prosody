/**
 * Token-span selection: the tap state machine every activity selects with.
 *
 * Vision.md rules out browser text selection—it fights native selection handles
 * on touch—so a span is formed by tapping its first token and then its last.
 * This module is that interaction as a pure reducer: a {@link Selection} value,
 * a {@link tapToken} transition, and {@link selectionSpan} to read the result as
 * the half-open `[start, end)` token range grading speaks in. The renderer
 * (`../components/PoemView`) owns only the pixels.
 *
 * Endpoints are whatever tokens the caller lets the learner tap—in practice
 * word tokens, since grading works word-only (`./tokenise`). The span between
 * two word endpoints still covers the punctuation lying between them, which is
 * what makes a selection reproduce the poem's surface when quoted back.
 */

import type { TokenSpan } from "./grade";

/**
 * The selection state machine.
 *
 * `anchored` is a half-formed selection: the learner has tapped a first token
 * and the next tap will close the span. It renders as a one-token selection so
 * a mis-tap is visible before it is compounded.
 */
export type Selection =
  | { readonly phase: "empty" }
  | { readonly phase: "anchored"; readonly anchor: number }
  | { readonly phase: "complete"; readonly anchor: number; readonly focus: number };

/** The starting state: nothing selected. */
export const EMPTY_SELECTION: Selection = { phase: "empty" };

/**
 * Advance the selection by one tap on the token at `index`.
 *
 * The three rules, in full:
 *
 *   - nothing selected: the tap anchors the span's first token
 *   - anchored: the tap closes the span—on the anchor itself it cancels
 *     instead, so a mis-tap is undone by tapping the same token again
 *   - complete: the tap starts a fresh selection at that token
 *
 * $Claude Plan.md asks for "adjust and clear a selection". Adjusting is
 * re-tapping the two ends, and clearing is {@link clearSelection} (a Clear
 * control) or the cancel tap above. The tempting alternative—letting a tap on a
 * complete selection drag its nearer edge—was rejected: it makes every tap's
 * meaning depend on where the current span happens to sit, so tapping a distant
 * word would silently stretch the old span rather than start a new one. Two
 * taps is cheap; a mode you cannot see is not. If adjusting by re-tapping
 * chafes in Richard's phone pass, edge handles are the change to make.
 */
export function tapToken(selection: Selection, index: number): Selection {
  if (selection.phase === "anchored") {
    if (selection.anchor === index) return EMPTY_SELECTION;
    return { phase: "complete", anchor: selection.anchor, focus: index };
  }
  return { phase: "anchored", anchor: index };
}

/** Discard the selection entirely. */
export function clearSelection(): Selection {
  return EMPTY_SELECTION;
}

/**
 * The selection as a half-open token span, or `null` when nothing is selected.
 * An anchored (half-formed) selection reads as its single anchor token.
 */
export function selectionSpan(selection: Selection): TokenSpan | null {
  if (selection.phase === "empty") return null;
  if (selection.phase === "anchored") {
    return { start: selection.anchor, end: selection.anchor + 1 };
  }
  const start = Math.min(selection.anchor, selection.focus);
  const end = Math.max(selection.anchor, selection.focus);
  return { start, end: end + 1 };
}

/** True when the token at `index` falls inside the current selection. */
export function isTokenSelected(selection: Selection, index: number): boolean {
  const span = selectionSpan(selection);
  return span !== null && index >= span.start && index < span.end;
}

/** The token fields {@link spanText} needs; `Token` satisfies it. */
interface PositionedToken {
  readonly lineIndex: number;
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * A span's text as it reads in the poem: the source text of every token in the
 * span, separated as the poem separates them. Used for the selection readout
 * and for quoting a recorded span—a mark, a reference answer—back to the
 * learner. A span running past the end of the poem stops at the last token.
 */
export function spanText(
  span: TokenSpan,
  lines: readonly string[],
  tokens: readonly PositionedToken[],
): string {
  const parts: string[] = [];
  let previous: { lineIndex: number; charEnd: number } | null = null;
  for (let i = Math.max(span.start, 0); i < Math.min(span.end, tokens.length); i++) {
    const token = tokens[i];
    if (previous) {
      // Within a line, reproduce the source gap so punctuation stays flush;
      // across a line break, a single space stands in for the newline.
      parts.push(
        previous.lineIndex === token.lineIndex
          ? (lines[token.lineIndex]?.slice(previous.charEnd, token.charStart) ?? " ")
          : " ",
      );
    }
    parts.push(lines[token.lineIndex]?.slice(token.charStart, token.charEnd) ?? "");
    previous = token;
  }
  return parts.join("");
}

/** The current selection's text, or `""` when nothing is selected. See {@link spanText}. */
export function selectionText(
  selection: Selection,
  lines: readonly string[],
  tokens: readonly PositionedToken[],
): string {
  const span = selectionSpan(selection);
  return span ? spanText(span, lines, tokens) : "";
}
