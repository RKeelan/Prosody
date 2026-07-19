/**
 * Quote anchor resolution.
 *
 * A pack stores reference spans as {@link QuoteAnchor}s—quoted text plus
 * optional prefix/suffix or occurrence disambiguation, after the W3C
 * TextQuoteSelector pattern (see `./pack/common`)—rather than character
 * offsets, because an LLM author can quote a poem reliably but cannot count
 * characters. This module resolves an anchor against a tokenised poem
 * (`./tokenise`) once, at load time, into a `[start, end)` token span; every
 * later consumer (graders, the renderer, the Task 3 validator) works in token
 * space from there.
 *
 * Matching works token-to-token rather than on raw joined text: the anchor's
 * `exact` (and `prefix`/`suffix`) text is tokenised with the same fragment
 * tokeniser the poem itself is tokenised with, and the resulting token-text
 * sequence is searched for as a contiguous run in the poem's token stream.
 * Because whitespace never becomes a token on either side, any whitespace run
 * in the anchor's text—a single space, several spaces, a newline—matches any
 * whitespace run in the poem, including the line break between two lines or
 * the blank line between two stanzas. That is the whole of the normalisation:
 * there is no separate "collapse whitespace" step, because tokenising already
 * discards it. An author who quotes "hope, / It sank" with a single space
 * resolves whether that boundary in the poem was a line break, a stanza break,
 * or a single space to begin with.
 *
 * Failures are data, not exceptions: {@link resolveAnchor} always returns, and
 * the caller (ultimately the Task 3 validator) switches on `status`.
 */

import type { TokenSpan } from "./grade";
import type { QuoteAnchor } from "./pack/common";
import { type Token, tokeniseFragment } from "./tokenise";

/** One candidate match for an anchor that turned out to be ambiguous. */
export interface AnchorMatch {
  /** The candidate's token span. */
  readonly span: TokenSpan;
  /** 0-based global line index of the match's first token. */
  readonly lineIndex: number;
  /** A short excerpt of poem text around the match, `[` `]` marking its bounds. */
  readonly context: string;
}

export type AnchorResolution =
  | { readonly status: "resolved"; readonly span: TokenSpan }
  | { readonly status: "unresolved"; readonly anchor: QuoteAnchor; readonly detail: string }
  | {
      readonly status: "ambiguous";
      readonly anchor: QuoteAnchor;
      readonly detail: string;
      readonly matches: readonly AnchorMatch[];
    };

/** The token texts a piece of anchor text tokenises to, ignoring whitespace and position. */
function fragmentTexts(text: string): string[] {
  return tokeniseFragment(text).map((f) => f.text);
}

/** Every start index in `tokens` where `needle`'s texts occur as a contiguous run. */
function findAllRuns(tokens: readonly Token[], needle: readonly string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i + needle.length <= tokens.length; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (tokens[i + j].text !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) starts.push(i);
  }
  return starts;
}

/** Whether `needle`'s texts occur, in order, starting exactly at token index `start`. */
function matchesAt(tokens: readonly Token[], start: number, needle: readonly string[]): boolean {
  if (start < 0 || start + needle.length > tokens.length) return false;
  for (let j = 0; j < needle.length; j++) {
    if (tokens[start + j].text !== needle[j]) return false;
  }
  return true;
}

/** A short human-readable excerpt around a span, for disambiguation messages. */
function contextFor(tokens: readonly Token[], span: TokenSpan, radius = 4): string {
  const from = Math.max(0, span.start - radius);
  const to = Math.min(tokens.length, span.end + radius);
  const parts: string[] = [];
  for (let i = from; i < to; i++) {
    if (i === span.start) parts.push("[");
    parts.push(tokens[i].text);
    if (i === span.end - 1) parts.push("]");
  }
  return parts.join(" ");
}

function toMatch(tokens: readonly Token[], start: number, length: number): AnchorMatch {
  const span: TokenSpan = { start, end: start + length };
  return { span, lineIndex: tokens[start].lineIndex, context: contextFor(tokens, span) };
}

/**
 * Resolve one {@link QuoteAnchor} against an already-tokenised poem's token
 * stream. The schema guarantees `occurrence` never appears alongside
 * `prefix`/`suffix` (see {@link QuoteAnchor}'s refinement), so at most one of
 * the two disambiguation strategies applies.
 */
export function resolveAnchor(tokens: readonly Token[], anchor: QuoteAnchor): AnchorResolution {
  const exactWords = fragmentTexts(anchor.exact);
  if (exactWords.length === 0) {
    return {
      status: "unresolved",
      anchor,
      detail: `the anchor's exact text ("${anchor.exact}") contains no tokens`,
    };
  }

  const rawMatches = findAllRuns(tokens, exactWords);
  if (rawMatches.length === 0) {
    return {
      status: "unresolved",
      anchor,
      detail: `no occurrence of "${anchor.exact}" found in the poem`,
    };
  }

  let candidates = rawMatches;

  if (anchor.prefix !== undefined || anchor.suffix !== undefined) {
    const prefixWords = anchor.prefix !== undefined ? fragmentTexts(anchor.prefix) : undefined;
    const suffixWords = anchor.suffix !== undefined ? fragmentTexts(anchor.suffix) : undefined;
    candidates = rawMatches.filter((start) => {
      const end = start + exactWords.length;
      const prefixOk =
        prefixWords === undefined || matchesAt(tokens, start - prefixWords.length, prefixWords);
      const suffixOk = suffixWords === undefined || matchesAt(tokens, end, suffixWords);
      return prefixOk && suffixOk;
    });
    if (candidates.length === 0) {
      return {
        status: "unresolved",
        anchor,
        detail: `"${anchor.exact}" occurs ${rawMatches.length} time(s), but none has the given prefix/suffix`,
      };
    }
  } else if (anchor.occurrence !== undefined) {
    const i = anchor.occurrence - 1;
    if (i < 0 || i >= rawMatches.length) {
      return {
        status: "unresolved",
        anchor,
        detail: `occurrence ${anchor.occurrence} requested, but "${anchor.exact}" occurs only ${rawMatches.length} time(s)`,
      };
    }
    candidates = [rawMatches[i]];
  }

  if (candidates.length > 1) {
    const matches = candidates.map((start) => toMatch(tokens, start, exactWords.length));
    return {
      status: "ambiguous",
      anchor,
      detail: `"${anchor.exact}" matches ${matches.length} places in the poem; add prefix/suffix or an occurrence index to disambiguate`,
      matches,
    };
  }

  const start = candidates[0];
  return { status: "resolved", span: { start, end: start + exactWords.length } };
}
