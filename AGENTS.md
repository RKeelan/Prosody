# AGENTS.md

Prosody is a single-poem study tool: a static web app that walks a learner through nine
activities on one poem, syntax before interpretation. Each poem is a JSON data pack validated
against a shared Zod schema. See [Vision.md](Vision.md) for the full design.

## Stack

Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui. Bun is the package manager, script
runner, and test runner. Grading logic lives in pure TypeScript modules under `bun test`.

## Commands

- `bun install` — install dependencies
- `bun run dev` — start the Vite dev server
- `bun run check` — Biome lint and format check
- `bun run format` — Biome auto-fix (format and safe lints)
- `bun test` — run tests (fails under 75% coverage)
- `bun run build` — type-check (`tsc -b`) and build for production
- `bun run validate` — validate pack JSON files against the schema and consistency checks

## Dependency Policy

All dependencies are pinned to exact versions — no ranges (`^`, `~`, `>=`, `*`). `bun add`
pins exact via `.npmrc` (`save-exact=true`) and `bunfig.toml` (`[install] exact = true`).
Dependabot handles upgrades, grouped weekly, on the **bun** ecosystem (not npm — CI installs
with `--frozen-lockfile`, so a stale `bun.lock` fails the build).
