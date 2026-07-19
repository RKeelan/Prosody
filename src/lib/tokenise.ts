/**
 * The poem tokeniser.
 *
 * Tokenises the whole poem exactly once into word and punctuation tokens laid
 * out in a single global index space—`tokens[i].index === i` for every token in
 * the poem, stanza after stanza, line after line. Anchor resolution (`./anchor`)
 * matches a quote anchor's text against this same stream and reports a
 * `[start, end)` range in these indices; grading (`./grade`) then works purely
 * in token space, and the Task 8 renderer groups tokens back into lines for
 * display.
 *
 * Grading only ever cares about word tokens—a trailing comma or a leading "the"
 * must never fail an overlap check—so {@link isWordToken} and
 * {@link wordTokenIndices} make filtering a span down to its words a one-liner.
 */

import type { TokenSpan } from "./grade";
import type { Poem } from "./pack/poem";

/** A token is either a run of word characters or a single punctuation mark. */
export type TokenKind = "word" | "punctuation";

export interface Token {
  /** This token's position in the whole-poem token stream, 0-based. */
  readonly index: number;
  readonly kind: TokenKind;
  /** The token's exact source text (case and diacritics preserved). */
  readonly text: string;
  /** 0-based stanza index. */
  readonly stanzaIndex: number;
  /** 0-based line index within the poem as a whole (stanza breaks do not reset it). */
  readonly lineIndex: number;
  /** 0-based line index within {@link stanzaIndex}'s stanza. */
  readonly lineIndexInStanza: number;
  /** Offset of the token's first character within its line's raw text, inclusive. */
  readonly charStart: number;
  /** Offset one past the token's last character within its line's raw text, exclusive. */
  readonly charEnd: number;
}

/** The result of tokenising a whole poem. */
export interface TokenisedPoem {
  /** Every token in the poem, in global order. */
  readonly tokens: readonly Token[];
  /**
   * Every line's raw text, in the same global order as {@link Token.lineIndex}.
   * Kept independent of the token stream so a line with no tokens (theoretically
   * possible—the schema only requires a non-empty string, e.g. a stray space)
   * still counts as a line; a validator checking scansion line counts against
   * the poem should compare against `lines.length`, not against tokens.
   */
  readonly lines: readonly string[];
}

/** A bare token—no position—produced by tokenising a standalone piece of text. */
export interface TokenFragment {
  readonly kind: TokenKind;
  readonly text: string;
}

// $Claude Apostrophe handling: U+0027 (straight ') and U+2019 (curly right
// single quote, ’) both count as apostrophes when they sit next to a word
// character, so "land's", "'Tis", "traveller's", and a trailing possessive
// like "boats'" all stay single word tokens. U+2018 (curly left single quote,
// ') is deliberately excluded—by typographic convention it only ever opens a
// quotation, never marks an elision or possessive, so it always tokenises as
// punctuation. U+2019 is genuinely ambiguous between an apostrophe and a
// closing quote (both use the same glyph in correctly set text, which is
// exactly why 'Tis is set with U+2019 rather than U+2018), and ASCII "'" is
// ambiguous in the same way for the same reason. Treating both as apostrophes
// is correct for the common case in verse (elisions, possessives) and an
// accepted, documented leak for the rarer single-quoted phrase, where a
// straight or curly-right closing quote will fuse onto the preceding word.
const APOSTROPHES = new Set(["'", "’"]);

// $Claude Hyphen handling: an ASCII hyphen counts as part of a word only when
// it joins word characters on both sides ("sea-crossing", "self-same" stay
// single tokens), matching how a hyphenated compound is one lexical item for
// syllable tapping and glossing. A hyphen without a word character on both
// sides—line-end punctuation, a standalone dash—is its own punctuation token.
// Em dashes (—) and en dashes (–) are distinct Unicode characters from the
// ASCII hyphen and are never treated as word-forming; poems use them as
// sentence-level punctuation, not to join words.
function isHyphen(ch: string | undefined): boolean {
  return ch === "-";
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

function isApostrophe(ch: string | undefined): boolean {
  return ch !== undefined && APOSTROPHES.has(ch);
}

interface OffsetFragment extends TokenFragment {
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * Split one piece of text (a poem line, or a quote anchor's text) into word and
 * punctuation fragments with in-text character offsets. Whitespace of any kind
 * (spaces, newlines, runs of either) separates tokens and never itself becomes
 * one—which is what lets anchor resolution treat a whitespace run in an
 * anchor's text as matching any whitespace run in the poem: neither side keeps
 * whitespace once tokenised, so a quote written "hope, / It sank" (one space)
 * matches poem text where a line break falls in the same place.
 */
function scan(text: string): OffsetFragment[] {
  const fragments: OffsetFragment[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    const startsWord =
      isWordChar(ch) || ((isApostrophe(ch) || isHyphen(ch)) && isWordChar(text[i + 1]));
    if (startsWord) {
      const start = i;
      i++;
      while (i < text.length) {
        const c = text[i];
        if (isWordChar(c)) {
          i++;
          continue;
        }
        if (isApostrophe(c) || isHyphen(c)) {
          if (isWordChar(text[i + 1])) {
            i++; // internal connector—keep consuming the word
            continue;
          }
          if (isApostrophe(c)) {
            i++; // trailing apostrophe (e.g. a plural possessive) joins the word
          }
          break; // a trailing hyphen with nothing after it does not
        }
        break;
      }
      fragments.push({ kind: "word", text: text.slice(start, i), charStart: start, charEnd: i });
      continue;
    }

    // A single punctuation character. $Claude Runs of punctuation (an ellipsis
    // typed as "...", a dash typed as "--") are not merged into one token—each
    // mark gets its own. Grading never inspects punctuation text, so nothing
    // downstream cares, and keeping the rule simple keeps the tokeniser simple.
    fragments.push({ kind: "punctuation", text: ch, charStart: i, charEnd: i + 1 });
    i++;
  }
  return fragments;
}

/**
 * Tokenise a standalone piece of text (not necessarily a full poem line) into
 * word/punctuation fragments, with no position information. Anchor resolution
 * uses this to turn a quote anchor's `exact`/`prefix`/`suffix` text into the
 * same token shape the poem itself is tokenised into, so the two can be
 * compared directly.
 */
export function tokeniseFragment(text: string): TokenFragment[] {
  return scan(text).map(({ kind, text: t }) => ({ kind, text: t }));
}

/** Tokenise a whole poem into one global, ordered token stream. */
export function tokenisePoem(poem: Poem): TokenisedPoem {
  const tokens: Token[] = [];
  const lines: string[] = [];
  let index = 0;
  let lineIndex = 0;
  for (const [stanzaIndex, stanza] of poem.stanzas.entries()) {
    for (const [lineIndexInStanza, lineText] of stanza.lines.entries()) {
      lines.push(lineText);
      for (const fragment of scan(lineText)) {
        tokens.push({
          index: index++,
          kind: fragment.kind,
          text: fragment.text,
          stanzaIndex,
          lineIndex,
          lineIndexInStanza,
          charStart: fragment.charStart,
          charEnd: fragment.charEnd,
        });
      }
      lineIndex++;
    }
  }
  return { tokens, lines };
}

/** True for a word token, false for punctuation. */
export function isWordToken(token: Token): boolean {
  return token.kind === "word";
}

/** Narrow a token span to the indices of its word tokens, in order, punctuation dropped. */
export function wordTokenIndices(tokens: readonly Token[], span: TokenSpan): number[] {
  const indices: number[] = [];
  const end = Math.min(span.end, tokens.length);
  for (let i = Math.max(span.start, 0); i < end; i++) {
    if (tokens[i].kind === "word") indices.push(i);
  }
  return indices;
}

/** Narrow a token span to its word tokens themselves, in order, punctuation dropped. */
export function wordTokens(tokens: readonly Token[], span: TokenSpan): Token[] {
  return wordTokenIndices(tokens, span).map((i) => tokens[i]);
}
