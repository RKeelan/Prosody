/**
 * Grading primitives.
 *
 * Grading happens at token granularity: a reference span and a learner span are
 * each a half-open range of token indices, `[start, end)`. Working in token
 * space (rather than character offsets) lets a trailing comma or a leading
 * "the" never fail an overlap check. This module seeds the pure-function
 * grading layer described in Vision.md; every activity's grader builds on it.
 */

export interface TokenSpan {
  /** First token index, inclusive. */
  start: number;
  /** One past the last token index, exclusive. */
  end: number;
}

/** True when two token spans share at least one token. */
export function spansOverlap(a: TokenSpan, b: TokenSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when two token spans cover exactly the same tokens. */
export function sameSpan(a: TokenSpan, b: TokenSpan): boolean {
  return a.start === b.start && a.end === b.end;
}
