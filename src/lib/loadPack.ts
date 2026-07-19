/**
 * The pack load pipeline.
 *
 * {@link loadPackFromText} is the one entry point the landing screen calls,
 * whatever the raw text's origin—file picker, drag-drop, the bundled sample,
 * or a cached last-loaded pack. It is pure and synchronous: raw file text in,
 * a discriminated result out, with no I/O of its own. Three ways a load can
 * end: the text is not JSON, the parsed JSON is not a clean pack (schema or
 * consistency findings from {@link validatePack}), or it is a clean pack,
 * paired with its {@link contentHash} for session keying. A JSON parse
 * failure is folded into the same `findings` shape validation failures use—
 * one `{ location: "(file)", message }` entry, following the convention
 * {@link validateFile} in `./validate` already uses for read/parse
 * failures—so the landing screen has exactly one error-rendering path
 * regardless of what went wrong.
 */

import { Pack } from "./pack";
import { contentHash } from "./session";
import { type Finding, validatePack } from "./validate";

/** The outcome of loading one pack file's raw text. */
export type LoadPackResult =
  | {
      readonly status: "ok";
      readonly pack: Pack;
      readonly rawText: string;
      readonly contentHash: string;
    }
  | { readonly status: "error"; readonly findings: readonly Finding[] };

/**
 * Parse and validate `rawText` as a pack. Never throws: a JSON syntax error
 * and every schema or consistency problem `validatePack` finds both come back
 * as `{ status: "error", findings }`.
 */
export function loadPackFromText(rawText: string): LoadPackResult {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      findings: [{ location: "(file)", message: `not valid JSON: ${message}` }],
    };
  }

  const findings = validatePack(raw);
  if (findings.length > 0) {
    return { status: "error", findings };
  }

  // Already proven valid by validatePack above; Pack.parse cannot fail here.
  return { status: "ok", pack: Pack.parse(raw), rawText, contentHash: contentHash(rawText) };
}
