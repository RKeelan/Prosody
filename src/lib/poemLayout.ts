/**
 * Display layout for the poem renderer.
 *
 * The tokeniser (`./tokenise`) flattens the poem into one global token stream;
 * the renderer needs it back in reading shape—stanzas of lines of tokens—plus
 * the exact whitespace that separated each token in the source, so indentation
 * and the spacing around punctuation survive rendering tokens as individual
 * spans.
 *
 * Layout is derived from the token stream rather than re-parsed from the pack,
 * so a token's `index` here is the same index anchor resolution and grading
 * speak in. Lines with no tokens (a stanza line of pure whitespace) still
 * appear, as empty lines, matching {@link TokenisedPoem.lines}.
 */

import type { Token, TokenisedPoem } from "./tokenise";

/** One token plus the source text that preceded it on its line. */
export interface LaidOutToken {
  readonly token: Token;
  /**
   * The exact characters between the previous token's end and this token's
   * start—leading indentation for a line's first token, the separating spaces
   * otherwise. Usually a single space, empty where punctuation abuts a word.
   */
  readonly gapBefore: string;
}

/** One line of the poem, ready to render. */
export interface LaidOutLine {
  /** 0-based line index within the poem as a whole, matching {@link Token.lineIndex}. */
  readonly lineIndex: number;
  /** 1-based line number for display in a margin. */
  readonly number: number;
  /** The line's raw source text. */
  readonly text: string;
  /** The line's tokens in order, each with the whitespace that preceded it. */
  readonly tokens: readonly LaidOutToken[];
}

/** One stanza of the poem, ready to render. */
export interface LaidOutStanza {
  /** 0-based stanza index, matching {@link Token.stanzaIndex}. */
  readonly stanzaIndex: number;
  readonly lines: readonly LaidOutLine[];
}

/**
 * Group a tokenised poem back into stanzas and lines for display.
 *
 * $Claude Stanza membership comes from the tokens, so a poem whose every line
 * is tokenless has no way to report its stanza grouping; that pack cannot exist
 * (the schema requires non-empty line strings and the validator resolves
 * anchors against real words), and such lines would fall into stanza 0 here.
 */
export function layOutPoem(tokenised: TokenisedPoem): LaidOutStanza[] {
  const stanzaOfLine = new Map<number, number>();
  const tokensOfLine = new Map<number, Token[]>();
  for (const token of tokenised.tokens) {
    stanzaOfLine.set(token.lineIndex, token.stanzaIndex);
    const existing = tokensOfLine.get(token.lineIndex);
    if (existing) existing.push(token);
    else tokensOfLine.set(token.lineIndex, [token]);
  }

  const stanzas: LaidOutStanza[] = [];
  let current: { stanzaIndex: number; lines: LaidOutLine[] } | null = null;
  for (const [lineIndex, text] of tokenised.lines.entries()) {
    const stanzaIndex: number = stanzaOfLine.get(lineIndex) ?? current?.stanzaIndex ?? 0;
    if (!current || current.stanzaIndex !== stanzaIndex) {
      current = { stanzaIndex, lines: [] };
      stanzas.push(current);
    }
    current.lines.push({
      lineIndex,
      number: lineIndex + 1,
      text,
      tokens: layOutLine(text, tokensOfLine.get(lineIndex) ?? []),
    });
  }
  return stanzas;
}

/** Pair each of a line's tokens with the source text separating it from the previous one. */
function layOutLine(text: string, tokens: readonly Token[]): LaidOutToken[] {
  let cursor = 0;
  return tokens.map((token) => {
    const gapBefore = text.slice(cursor, token.charStart);
    cursor = token.charEnd;
    return { token, gapBefore };
  });
}
