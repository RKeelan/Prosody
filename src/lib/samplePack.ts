/**
 * The bundled sample pack for the landing screen's one-tap load-sample
 * affordance.
 *
 * $Claude Plan.md Task 7 calls for the fixture pack to ship in the build,
 * dev server and PR previews alike, since juggling JSON files on a phone
 * makes the file picker a toll-gate. Importing the raw text with Vite's
 * `?raw` loader—rather than importing the JSON module directly—sends the
 * sample through {@link loadPackFromText} exactly as a picked or dropped
 * file would be, so it hashes identically to the same file loaded by hand.
 */

import ozymandiasRaw from "../../packs/ozymandias.json?raw";

/** The raw text of `packs/ozymandias.json`, as bundled at build time. */
export const SAMPLE_PACK_TEXT: string = ozymandiasRaw;
