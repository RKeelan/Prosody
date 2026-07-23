/**
 * The pack validator.
 *
 * A pack that parses against the Zod schema is only shape-valid—the schema
 * states shape, this module states truth (see `./pack/index`'s doc comment).
 * {@link validatePack} runs every cross-cutting consistency check Vision.md's
 * authoring pipeline requires: anchors resolve, enabled activities carry their
 * data, scansion syllable counts match the text, rhyme is a proper partition,
 * device references are sound, glossary spans don't collide, and the Activity
 * 6/7 apostrophe cross-check has something to check against.
 *
 * Every check returns {@link Finding}s—a location string in the same
 * dot/bracket notation as a Zod issue path (e.g. `sentences[2].subject.
 * alternates[0]`) plus a human-readable message—and every check runs, so a
 * pack author sees every problem in one pass rather than fixing findings one
 * at a time. The one exception is schema validation itself: a pack that fails
 * to parse stops there, because none of the later checks can trust a
 * malformed shape (this scripts/validate.ts's CLI wrapper, and the file-level
 * {@link validateFiles} here, both stay thin—the logic lives in this module so
 * it is testable without a subprocess).
 */

import { resolveAnchor } from "./anchor";
import type { TokenSpan } from "./grade";
import { spansOverlap } from "./grade";
import {
  type AnswerTarget,
  type ClauseNode,
  Pack,
  type QuoteAnchor,
  type TargetAnswer,
} from "./pack";
import { poemSyllables, resolveSyllabifications } from "./syllables";
import { type Token, type TokenisedPoem, tokenisePoem } from "./tokenise";

/** One validation problem: where in the pack it lives, and what's wrong. */
export interface Finding {
  /** Dot/bracket path into the pack, e.g. `sentences[2].subject.alternates[0]`. */
  location: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Schema-issue formatting
// ---------------------------------------------------------------------------

/** Render a Zod issue path the same way every other {@link Finding} is located. */
function formatIssuePath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      out += out.length > 0 ? `.${String(segment)}` : String(segment);
    }
  }
  return out.length > 0 ? out : "(root)";
}

// ---------------------------------------------------------------------------
// Anchors: every anchor anywhere in the pack must resolve uniquely
// ---------------------------------------------------------------------------

function checkAnchor(
  findings: Finding[],
  tokens: readonly Token[],
  anchor: QuoteAnchor,
  location: string,
): void {
  const result = resolveAnchor(tokens, anchor);
  if (result.status === "resolved") return;
  if (result.status === "unresolved") {
    findings.push({
      location,
      message: `anchor "${anchor.exact}" is unresolved: ${result.detail}`,
    });
  } else {
    findings.push({ location, message: `anchor "${anchor.exact}" is ambiguous: ${result.detail}` });
  }
}

function checkAnswerTarget(
  findings: Finding[],
  tokens: readonly Token[],
  target: AnswerTarget,
  location: string,
): void {
  if (target.kind === "span") checkAnchor(findings, tokens, target.anchor, location);
}

/** Check a {@link TargetAnswer}'s `answer` and every `alternates` entry. */
function checkTargetAnswer(
  findings: Finding[],
  tokens: readonly Token[],
  target: TargetAnswer,
  location: string,
): void {
  checkAnswerTarget(findings, tokens, target.answer, `${location}.answer`);
  target.alternates.forEach((alt, i) => {
    checkAnswerTarget(findings, tokens, alt, `${location}.alternates[${i}]`);
  });
}

function checkClauseTree(
  findings: Finding[],
  tokens: readonly Token[],
  node: ClauseNode,
  location: string,
): void {
  if (node.anchor) checkAnchor(findings, tokens, node.anchor, `${location}.anchor`);
  (node.children ?? []).forEach((child, i) => {
    checkClauseTree(findings, tokens, child, `${location}.children[${i}]`);
  });
}

/**
 * Walk every anchor in the pack—syllabifications, scansion deviations and
 * elision questions, pronouns (chip plus antecedent answer/alternates),
 * sentences (anchor plus subject/verb/object answers/alternates plus gnarly
 * clause anchors), glossary words, device instances, and allusions—and report
 * every one that fails to resolve uniquely.
 */
function checkAnchors(pack: Pack, tokens: readonly Token[]): Finding[] {
  const findings: Finding[] = [];

  pack.poem.syllabifications.forEach((s, i) => {
    checkAnchor(findings, tokens, s.word, `poem.syllabifications[${i}].word`);
  });

  if (pack.scansion) {
    pack.scansion.deviations.forEach((d, i) => {
      checkAnchor(findings, tokens, d.anchor, `scansion.deviations[${i}].anchor`);
    });
    pack.scansion.elisionQuestions.forEach((q, i) => {
      checkAnchor(findings, tokens, q.anchor, `scansion.elisionQuestions[${i}].anchor`);
    });
  }

  (pack.pronouns ?? []).forEach((p, i) => {
    checkAnchor(findings, tokens, p.pronoun, `pronouns[${i}].pronoun`);
    checkTargetAnswer(findings, tokens, p.antecedent, `pronouns[${i}].antecedent`);
  });

  (pack.sentences ?? []).forEach((s, i) => {
    checkAnchor(findings, tokens, s.anchor, `sentences[${i}].anchor`);
    checkTargetAnswer(findings, tokens, s.subject, `sentences[${i}].subject`);
    checkTargetAnswer(findings, tokens, s.verb, `sentences[${i}].verb`);
    if (s.object.kind === "present") {
      checkTargetAnswer(findings, tokens, s.object.target, `sentences[${i}].object.target`);
    }
    if (s.gnarly) checkClauseTree(findings, tokens, s.gnarly, `sentences[${i}].gnarly`);
  });

  (pack.glossary ?? []).forEach((g, i) => {
    checkAnchor(findings, tokens, g.word, `glossary[${i}].word`);
  });

  (pack.devices?.instances ?? []).forEach((inst, i) => {
    checkAnchor(findings, tokens, inst.anchor, `devices.instances[${i}].anchor`);
  });

  (pack.allusions ?? []).forEach((a, i) => {
    checkAnchor(findings, tokens, a.anchor, `allusions[${i}].anchor`);
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Active-activity flags: an enabled activity must carry its reference data
// ---------------------------------------------------------------------------

/**
 * `readSilently` gates Activity 1, which carries no reference section, so it
 * is deliberately absent from this list. Every other flag names the pack
 * section its activity draws on; presence is all this checks—the schema
 * already forces the section's internal shape to be correct (e.g. every
 * pronoun entry already carries an antecedent), so there's no "every target
 * pronoun has an antecedent" check left to write here.
 */
function checkActiveActivities(pack: Pack): Finding[] {
  const findings: Finding[] = [];
  const aa = pack.activeActivities;
  const sections: Array<[keyof typeof aa, unknown]> = [
    ["scansion", pack.scansion],
    ["pronouns", pack.pronouns],
    ["sentences", pack.sentences],
    ["glossary", pack.glossary],
    ["devices", pack.devices],
    ["broadDevices", pack.broadDevices],
    ["allusions", pack.allusions],
    ["argument", pack.argument],
  ];
  for (const [flag, section] of sections) {
    if (aa[flag] && section === undefined) {
      findings.push({
        location: `activeActivities.${flag}`,
        message: `activeActivities.${flag} is enabled, but the pack has no "${flag}" section.`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Scansion: line count, per-syllable counts, syllabification concatenation,
// and elision-question/syllabification consistency
// ---------------------------------------------------------------------------

/**
 * scansion.lines.length must match the poem's line count, and each line's
 * scanned syllable count must match the text. Syllable divisions come from the
 * shared projection in `./syllables`: a word with a syllabification entry takes
 * its chunks, and a word without one counts as a single syllable. A
 * multi-syllable word left unsyllabified therefore counts short, and the
 * mismatch surfaces here—which is what forces every such word to be
 * syllabified, so Activity 2 can split it into tappable chips. A line-count
 * mismatch makes per-line comparison meaningless, so it short-circuits the rest
 * of this check—but not the pack's other checks, which still run.
 */
function checkScansion(pack: Pack, tokenised: TokenisedPoem): Finding[] {
  if (!pack.scansion) return [];
  const findings: Finding[] = [];
  const lineCount = tokenised.lines.length;

  if (pack.scansion.lines.length !== lineCount) {
    findings.push({
      location: "scansion.lines",
      message: `scansion declares ${pack.scansion.lines.length} line(s) but the poem has ${lineCount}.`,
    });
    return findings;
  }

  const resolved = resolveSyllabifications(tokenised.tokens, pack.poem.syllabifications);
  const lineSyllables = poemSyllables(tokenised, resolved);
  pack.scansion.lines.forEach((scansionLine, lineIndex) => {
    const line = lineSyllables[lineIndex];
    const counted = line.syllableCount;
    const expected = scansionLine.syllables.length;
    if (counted !== expected) {
      const breakdown = line.words.map((w) => `${w.text}(${w.syllables.length})`).join(" ");
      findings.push({
        location: `scansion.lines[${lineIndex}]`,
        message:
          `line ${lineIndex} scans ${expected} syllable(s) but the text counts ${counted}: ${breakdown}. ` +
          "If a word of more than one syllable lacks a syllabification entry, add one; otherwise fix the scansion.",
      });
    }
  });

  return findings;
}

/** Each syllabification entry's syllables must re-concatenate to the word's exact text. */
function checkSyllabificationConcatenation(pack: Pack, tokens: readonly Token[]): Finding[] {
  const findings: Finding[] = [];
  pack.poem.syllabifications.forEach((s, i) => {
    const result = resolveAnchor(tokens, s.word);
    if (result.status !== "resolved") return; // already reported by checkAnchors
    const matched = tokens
      .slice(result.span.start, result.span.end)
      .map((t) => t.text)
      .join("");
    const concatenated = s.syllables.join("");
    if (concatenated !== matched) {
      findings.push({
        location: `poem.syllabifications[${i}].syllables`,
        message: `syllables ${JSON.stringify(s.syllables)} concatenate to "${concatenated}", not "${matched}".`,
      });
    }
  });
  return findings;
}

/**
 * An elision question's syllableCount answer key must be consistent with a
 * syllabification entry for the same word occurrence, where both exist: the
 * syllabification's count should be one of the accepted answers.
 */
function checkElisionConsistency(pack: Pack, tokens: readonly Token[]): Finding[] {
  if (!pack.scansion) return [];
  const findings: Finding[] = [];
  const syllabifications = resolveSyllabifications(tokens, pack.poem.syllabifications);

  pack.scansion.elisionQuestions.forEach((q, i) => {
    const result = resolveAnchor(tokens, q.anchor);
    if (result.status !== "resolved") return; // already reported by checkAnchors
    const match = syllabifications.find((s) => spansOverlap(s.span, result.span));
    if (!match) return; // no syllabification for this word occurrence—nothing to cross-check

    const accepted = [q.syllableCount.answer, ...q.syllableCount.alternates];
    if (!accepted.includes(match.syllables.length)) {
      findings.push({
        location: `scansion.elisionQuestions[${i}].syllableCount`,
        message:
          `accepts ${JSON.stringify(accepted)} syllable(s), but poem.syllabifications[${match.index}] ` +
          `divides the same word into ${match.syllables.length}.`,
      });
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Rhyme: every index valid, no repeats, full coverage when non-empty
// ---------------------------------------------------------------------------

function checkRhyme(pack: Pack, lineCount: number): Finding[] {
  if (!pack.scansion) return [];
  const partition = pack.scansion.rhyme;
  if (partition.length === 0) return [];

  const findings: Finding[] = [];
  const firstSeenIn = new Map<number, number>();

  partition.forEach((group, groupIndex) => {
    group.forEach((lineIndex) => {
      if (lineIndex >= lineCount) {
        findings.push({
          location: `scansion.rhyme[${groupIndex}]`,
          message: `line index ${lineIndex} is out of range—the poem has ${lineCount} line(s).`,
        });
        return;
      }
      const prior = firstSeenIn.get(lineIndex);
      if (prior !== undefined) {
        findings.push({
          location: `scansion.rhyme[${groupIndex}]`,
          message: `line index ${lineIndex} also appears in scansion.rhyme[${prior}]—a line rhymes in one group only.`,
        });
      } else {
        firstSeenIn.set(lineIndex, groupIndex);
      }
    });
  });

  const missing: number[] = [];
  for (let line = 0; line < lineCount; line++) {
    if (!firstSeenIn.has(line)) missing.push(line);
  }
  if (missing.length > 0) {
    findings.push({
      location: "scansion.rhyme",
      message: `a non-empty rhyme partition must cover every line; missing line(s) ${missing.join(", ")} (an unrhymed line stands alone in its own group).`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Devices: instances reference a palette entry the pack defines; ids unique
// ---------------------------------------------------------------------------

function checkDevices(pack: Pack): Finding[] {
  if (!pack.devices) return [];
  const findings: Finding[] = [];

  const firstSeenIn = new Map<string, number>();
  pack.devices.palette.forEach((entry, i) => {
    const prior = firstSeenIn.get(entry.id);
    if (prior !== undefined) {
      findings.push({
        location: `devices.palette[${i}].id`,
        message: `palette id "${entry.id}" duplicates devices.palette[${prior}].id.`,
      });
    } else {
      firstSeenIn.set(entry.id, i);
    }
  });

  pack.devices.instances.forEach((inst, i) => {
    if (!firstSeenIn.has(inst.deviceId)) {
      findings.push({
        location: `devices.instances[${i}].deviceId`,
        message: `deviceId "${inst.deviceId}" names no entry in devices.palette.`,
      });
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Glossary: no two entries resolve to the same token span
// ---------------------------------------------------------------------------

function checkGlossary(pack: Pack, tokens: readonly Token[]): Finding[] {
  const entries = pack.glossary ?? [];
  const findings: Finding[] = [];
  const seen: Array<{ index: number; span: TokenSpan }> = [];

  entries.forEach((g, i) => {
    const result = resolveAnchor(tokens, g.word);
    if (result.status !== "resolved") return; // already reported by checkAnchors
    const dup = seen.find(
      (s) => s.span.start === result.span.start && s.span.end === result.span.end,
    );
    if (dup) {
      findings.push({
        location: `glossary[${i}].word`,
        message: `resolves to the same span as glossary[${dup.index}].word—one entry per word.`,
      });
    } else {
      seen.push({ index: i, span: result.span });
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Cross-activity: an apostrophe device instance needs broadDevices to check
// the addressee against, when Activity 7 is enabled
// ---------------------------------------------------------------------------

/**
 * $Claude Vision.md and Plan.md describe the app-side check ("if Activity 6
 * found an apostrophe, the addressee answer is cross-checked against it") but
 * whether the addressee text actually names the apostrophe's target is a
 * judgment call, not machine-checkable—no string comparison substitutes for
 * reading the poem. This validator checks only what a validator can: that
 * `broadDevices` exists at all when an apostrophe instance and Activity 7 both
 * do, so the app has an addressee to cross-check against in the first place.
 */
function checkCrossActivity(pack: Pack): Finding[] {
  if (!pack.activeActivities.broadDevices) return [];
  const palette = pack.devices?.palette ?? [];
  const instances = pack.devices?.instances ?? [];

  const apostropheIds = new Set(
    palette
      .filter((p) => p.id === "apostrophe" || p.name.toLowerCase() === "apostrophe")
      .map((p) => p.id),
  );
  const hasApostropheInstance = instances.some((inst) => apostropheIds.has(inst.deviceId));

  if (hasApostropheInstance && pack.broadDevices === undefined) {
    return [
      {
        location: "broadDevices",
        message:
          "devices includes an apostrophe instance and Activity 7 is enabled, but broadDevices " +
          "is missing—Activity 7's addressee cross-check has nothing to check against.",
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Validate one pack. `raw` is whatever `JSON.parse` produced—unvalidated. A
 * pack that fails schema validation returns one {@link Finding} per Zod issue
 * and stops there; a pack that parses runs every consistency check and
 * collects every finding, so a pack author sees the whole picture in one pass.
 * An empty result means the pack is clean.
 */
export function validatePack(raw: unknown): Finding[] {
  const parsed = Pack.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      location: formatIssuePath(issue.path),
      message: issue.message,
    }));
  }

  const pack = parsed.data;
  const tokenised = tokenisePoem(pack.poem);
  const { tokens, lines } = tokenised;

  return [
    ...checkAnchors(pack, tokens),
    ...checkActiveActivities(pack),
    ...checkScansion(pack, tokenised),
    ...checkSyllabificationConcatenation(pack, tokens),
    ...checkElisionConsistency(pack, tokens),
    ...checkRhyme(pack, lines.length),
    ...checkDevices(pack),
    ...checkGlossary(pack, tokens),
    ...checkCrossActivity(pack),
  ];
}

// ---------------------------------------------------------------------------
// File-level helpers—the only impure part of this module, kept small so the
// CLI wrapper (scripts/validate.ts) stays nearly logic-free, and testable
// without spawning a subprocess.
// ---------------------------------------------------------------------------

/** One file's validation result. */
export interface FileResult {
  path: string;
  findings: Finding[];
}

/** Read, parse, and validate one pack file. JSON and I/O failures become a finding, not a throw. */
export async function validateFile(path: string): Promise<FileResult> {
  let raw: unknown;
  try {
    const text = await Bun.file(path).text();
    raw = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      path,
      findings: [{ location: "(file)", message: `could not read or parse: ${message}` }],
    };
  }
  return { path, findings: validatePack(raw) };
}

/** Validate every path given, in order. */
export async function validateFiles(paths: readonly string[]): Promise<FileResult[]> {
  return Promise.all(paths.map(validateFile));
}

/**
 * Every `*.json` file under `dir`, recursively, sorted for stable output.
 * Returns an empty array when `dir` doesn't exist or holds no JSON files—the
 * CLI treats both the same way (a note, exit 0), since packs/ arrives in
 * Task 4 and CI must stay green before and after that lands.
 */
export async function discoverPackFiles(dir: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.json");
  const found: string[] = [];
  try {
    for await (const relative of glob.scan(dir)) {
      found.push(`${dir}/${relative.replaceAll("\\", "/")}`);
    }
  } catch {
    return []; // dir doesn't exist (or isn't readable)—treated as "nothing to validate"
  }
  return found.sort();
}
