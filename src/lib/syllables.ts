/**
 * Poem syllable divisions: the bridge from a pack's per-word syllabifications to
 * the per-line, per-syllable shape Activity 2 taps and grades against.
 *
 * Scansion stores stress per syllable, flat, one list per line—it says nothing
 * about where one word's syllables end and the next begins. That mapping is
 * reconstructed here: each word takes its explicit syllabification chunks where
 * the pack supplies them, and otherwise counts as a single syllable (its whole
 * text). The validator (`./validate`) and the renderer (`../components/
 * ReadAloudActivity`) both build on this one projection, so the tappable
 * syllables the learner sees always line up with the reference the grader
 * checks against.
 *
 * "No entry means one syllable" is the load-bearing rule: a word of two or more
 * syllables that lacks a syllabification would count short here, the line's
 * total would miss the scansion's, and the validator's line-count check flags
 * it. That is what forces every multi-syllable word to be syllabified, which is
 * exactly what the renderer needs to split it into chips.
 */

import { resolveAnchor } from "./anchor";
import type { TokenSpan } from "./grade";
import type { Syllabification } from "./pack/poem";
import type { Token, TokenisedPoem } from "./tokenise";

/** A syllabification entry whose anchor resolved, with the span and chunks it asserts. */
export interface ResolvedSyllabification {
  /** Index into `poem.syllabifications`, for error messages and cross-checks. */
  readonly index: number;
  /** The word's token span the entry covers—usually one token. */
  readonly span: TokenSpan;
  /** The word's syllable chunks, in order. */
  readonly syllables: readonly string[];
}

/**
 * Resolve every syllabification entry against the poem's token stream, dropping
 * those whose anchor fails to resolve (the validator reports those separately as
 * anchor findings, so they are simply absent here rather than a hard error).
 */
export function resolveSyllabifications(
  tokens: readonly Token[],
  syllabifications: readonly Syllabification[],
): ResolvedSyllabification[] {
  const resolved: ResolvedSyllabification[] = [];
  syllabifications.forEach((s, index) => {
    const result = resolveAnchor(tokens, s.word);
    if (result.status === "resolved") {
      resolved.push({ index, span: result.span, syllables: s.syllables });
    }
  });
  return resolved;
}

/** One word's syllable division within a line. */
export interface WordSyllables {
  /** The word's first token index in the global stream. */
  readonly tokenIndex: number;
  /** The word's token span—more than one token only for a multi-word syllabification. */
  readonly span: TokenSpan;
  /** The word's exact text (its tokens concatenated). */
  readonly text: string;
  /** The word split into syllable chunks, in order. */
  readonly syllables: readonly string[];
  /** True when a pack syllabification supplied the split; false when taken whole. */
  readonly fromSyllabification: boolean;
  /** 0-based index of this word's first syllable within its line. */
  readonly syllableStart: number;
}

/** One line's syllables, grouped by word, in reading order. */
export interface LineSyllables {
  readonly lineIndex: number;
  readonly words: readonly WordSyllables[];
  /** Total syllables across the line's words—the count scansion must match. */
  readonly syllableCount: number;
}

/** Group a poem's word tokens per line, preserving global order. */
function tokensByLine(tokenised: TokenisedPoem): Token[][] {
  const byLine: Token[][] = tokenised.lines.map(() => []);
  for (const token of tokenised.tokens) {
    byLine[token.lineIndex]?.push(token);
  }
  return byLine;
}

/**
 * Project a tokenised poem into per-line, per-word syllables. Each word takes
 * its resolved syllabification chunks where one covers its first token, and
 * otherwise stands as a single syllable. Punctuation tokens are skipped—only
 * words carry syllables.
 */
export function poemSyllables(
  tokenised: TokenisedPoem,
  resolved: readonly ResolvedSyllabification[],
): LineSyllables[] {
  const byLine = tokensByLine(tokenised);
  return byLine.map((lineTokens, lineIndex) => {
    const words: WordSyllables[] = [];
    let syllableStart = 0;
    let i = 0;
    while (i < lineTokens.length) {
      const token = lineTokens[i];
      if (token.kind !== "word") {
        i++;
        continue;
      }
      const covering = resolved.find((r) => r.span.start === token.index);
      if (covering) {
        const text = tokenised.tokens
          .slice(covering.span.start, covering.span.end)
          .map((t) => t.text)
          .join("");
        words.push({
          tokenIndex: token.index,
          span: covering.span,
          text,
          syllables: covering.syllables,
          fromSyllabification: true,
          syllableStart,
        });
        syllableStart += covering.syllables.length;
        i += covering.span.end - covering.span.start;
      } else {
        words.push({
          tokenIndex: token.index,
          span: { start: token.index, end: token.index + 1 },
          text: token.text,
          syllables: [token.text],
          fromSyllabification: false,
          syllableStart,
        });
        syllableStart += 1;
        i += 1;
      }
    }
    return { lineIndex, words, syllableCount: syllableStart };
  });
}
