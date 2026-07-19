/**
 * A content hash for pack files.
 *
 * {@link contentHash} maps the raw text of a pack file to a stable 64-bit hex
 * digest with the FNV-1a algorithm. It exists to key persisted progress: a
 * session lives under `pack id + content hash` (Vision.md, "Sessions and
 * attempts"), so editing a pack changes its hash and the app can offer to keep or
 * discard progress made against the old text.
 *
 * $Claude The hash guards against accidental pack edits, not adversaries, so a
 * fast non-cryptographic hash is the right tool. FNV-1a is tiny, dependency-free,
 * and deterministic across platforms; a cryptographic digest would add cost and a
 * subtle-crypto async API for no benefit here. The arithmetic runs in BigInt so
 * the 64-bit maths stays exact—JavaScript numbers lose precision past 2^53.
 */

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * The FNV-1a 64-bit hash of `text`, as a zero-padded 16-character lowercase hex
 * string. The input is hashed as its UTF-8 bytes, so the digest never depends on
 * platform string encoding. Pure and synchronous.
 */
export function contentHash(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
