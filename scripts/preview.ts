#!/usr/bin/env bun
/**
 * Serves the production build in `dist/` for a local look before deploying;
 * run `bun run build` first.
 *
 * Like Cloudflare Pages for a site with no `404.html`, it answers any path
 * that is not a file in `dist/` with `index.html`.
 */

import { join } from "node:path";

const root = "dist";

const server = Bun.serve({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = Bun.file(join(root, pathname));
    return new Response((await file.exists()) ? file : Bun.file(join(root, "index.html")));
  },
});

console.log(`Serving ${root}/ at ${server.url}`);
