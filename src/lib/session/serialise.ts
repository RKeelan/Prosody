/**
 * Session serialisation.
 *
 * Progress is stored as a versioned JSON envelope, `{ version, data }`. The
 * version guards forward compatibility—a build that understands only version 1
 * must reject a version 2 blob rather than mis-parse it—and the whole envelope is
 * validated with the {@link SessionData} schema on the way in. Corruption,
 * truncation, hand-editing, or a future version therefore fail soft:
 * {@link deserialiseSession} returns a typed error result and never throws, so a
 * bad localStorage entry can be reported or discarded but never crashes the app.
 *
 * Both functions are pure; the round trip is a tested invariant.
 */

import { z } from "zod";
import { SessionData } from "./model";

/** The envelope schema version. Bump only alongside a migration path on load. */
export const ENVELOPE_VERSION = 1;

const Envelope = z.object({
  version: z.literal(ENVELOPE_VERSION),
  data: SessionData,
});

/** Serialise a session to its stored string form. */
export function serialiseSession(data: SessionData): string {
  return JSON.stringify({ version: ENVELOPE_VERSION, data });
}

/** The outcome of parsing a stored session: the data, or why it could not be read. */
export type DeserialiseResult =
  | { readonly ok: true; readonly data: SessionData }
  | { readonly ok: false; readonly error: string };

/**
 * Parse a stored session string back to {@link SessionData}. Never throws: a JSON
 * error, a version mismatch, or a schema violation each returns `{ ok: false }`
 * with a human-readable reason.
 */
export function deserialiseSession(text: string): DeserialiseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `not valid JSON: ${message}` };
  }

  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path.length > 0 ? first.path.join(".") : "(root)";
    return { ok: false, error: `invalid session data at ${where}: ${first.message}` };
  }
  return { ok: true, data: parsed.data.data };
}
