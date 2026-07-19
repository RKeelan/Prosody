#!/usr/bin/env bun
/**
 * The pack validator CLI.
 *
 * `bun scripts/validate.ts <pack.json> [more.json...]` validates the named
 * files. With no arguments, it validates every `*.json` under `packs/`; when
 * `packs/` is absent or empty (it arrives in Task 4), this prints a note and
 * exits 0 rather than failing, so CI stays green before and after that lands.
 *
 * Bun executes TypeScript directly, so this needs no build step and runs the
 * same way on Windows and in CI. All the logic lives in `../src/lib/validate`
 * ({@link validatePack}, {@link validateFiles}, {@link discoverPackFiles}),
 * which is unit-tested directly; this wrapper only resolves arguments, prints
 * results, and sets the exit code.
 */

import { discoverPackFiles, validateFiles } from "../src/lib/validate";

async function main(): Promise<void> {
  const argPaths = process.argv.slice(2);
  const paths = argPaths.length > 0 ? argPaths : await discoverPackFiles("packs");

  if (paths.length === 0) {
    console.log("No pack files to validate (packs/ is absent or empty).");
    process.exit(0);
  }

  const results = await validateFiles(paths);
  let anyFindings = false;
  for (const result of results) {
    if (result.findings.length === 0) {
      console.log(`${result.path}: OK`);
    } else {
      anyFindings = true;
      for (const finding of result.findings) {
        console.log(`${result.path}: ${finding.location}: ${finding.message}`);
      }
    }
  }

  process.exit(anyFindings ? 1 : 0);
}

await main();
