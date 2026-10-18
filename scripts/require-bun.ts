#!/usr/bin/env bun
/**
 * Fails when the running Bun is older than the one in `.bun-version`.
 *
 * An older Bun can pass the build without checking anything: before 1.4,
 * `bun --check` prints its help and exits 0. Cloudflare Pages builds with its
 * own default Bun unless the project's `BUN_VERSION` variable says otherwise,
 * so the build starts with this script.
 */

const required = (await Bun.file(new URL("../.bun-version", import.meta.url)).text()).trim();

if (Bun.semver.order(Bun.version, required) < 0) {
  console.error(`Bun ${Bun.version} is older than ${required}, the version in .bun-version.`);
  process.exit(1);
}
