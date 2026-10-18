# AGENTS.md

Prosody is a single-poem study tool: a static web app that walks a learner through nine
activities on one poem, syntax before interpretation. Each poem is a JSON data pack validated
against a shared Zod schema. See [Vision.md](Vision.md) for the full design.

## Stack

React + TypeScript, Tailwind CSS v4, shadcn/ui. Bun is the package manager, dev server,
bundler, type checker, script runner, and test runner. Tailwind compiles through
bun-plugin-tailwind, which `bunfig.toml` loads for the dev server and `scripts/build.ts` loads
for the build. The plugin bundles its own Tailwind compiler, so upgrading the `tailwindcss`
package doesn't upgrade the compiler. Grading logic lives in pure TypeScript modules under
`bun test`.

## Commands

- `bun install` — install dependencies
- `bun run dev` — start Bun's dev server, with hot reload
- `bun run check` — Biome lint and format check (`bun check` runs this script too, not the
  type checker)
- `bun run typecheck` — type-check `src/` and `scripts/`
- `bun run format` — Biome auto-fix (format and safe lints)
- `bun test` — run tests (fails under 75% coverage)
- `bun run build` — type-check and build for production into `dist/`
- `bun run validate` — validate pack JSON files against the schema and consistency checks

## Git Workflow

This repo overrides the usual "get commit-message and PR-body approval before committing"
convention. A change Richard needs to test is testable only once its Cloudflare Pages preview
builds, and that preview exists only after the PR is pushed. So the order is: build and gate
the change (`bun run check`, `bun test`, `bun run build`), then commit, push, and open the PR
straight away with a well-formed message—no pre-commit sign-off. Then hand Richard the preview
URL (the stable branch alias, `https://<branch>.prosody.pages.dev`) and ask him to approve.
Fold any message or content feedback in by amending, and merge only on his OK.

## Dependency Policy

All dependencies are pinned to exact versions — no ranges (`^`, `~`, `>=`, `*`). `bun add`
pins exact via `.npmrc` (`save-exact=true`) and `bunfig.toml` (`[install] exact = true`).
Dependabot handles upgrades, grouped monthly, on the **bun** ecosystem (not npm — CI installs
with `--frozen-lockfile`, so a stale `bun.lock` fails the build).
