#!/usr/bin/env bun
/**
 * The production build: bundles `index.html` and everything it reaches into
 * `dist/`.
 *
 * This is a script rather than a `bun build` command because Tailwind needs
 * bun-plugin-tailwind, and the CLI does not load plugins from bunfig.toml.
 */

import { rm } from "node:fs/promises";
import { relative } from "node:path";
import tailwind from "bun-plugin-tailwind";

const outdir = "dist";

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["index.html"],
  outdir,
  plugins: [tailwind],
  minify: true,
  // Selects React's production build and the production JSX transform.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  // Cloudflare Pages serves the app from the domain root.
  publicPath: "/",
});

for (const output of result.outputs) {
  console.log(`${relative(".", output.path)}  ${(output.size / 1024).toFixed(2)} kB`);
}
