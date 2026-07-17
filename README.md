# Prosody

[![CI](https://github.com/RKeelan/Prosody/actions/workflows/ci.yml/badge.svg)](https://github.com/RKeelan/Prosody/actions/workflows/ci.yml)

A single-poem study session: syntax before interpretation, granular before broad. Prosody
walks a learner through nine activities on one poem — from silent reading and scansion to
pronoun resolution, diction, devices, allusions, and a final argument — revealing reference
answers only after each answer is committed.

A personal tool, not a product. Mobile is a first-class target: every interaction is built on
tapping tokens, never on browser text selection. See [Vision.md](Vision.md) for the full design.

## Stack

Vite + React + TypeScript, Tailwind CSS v4, and shadcn/ui, with Bun as the package manager,
script runner, and test runner. Each poem is a JSON data pack validated against a shared Zod
schema. Deployed to GitHub Pages.

## Commands

- `bun install` — install dependencies
- `bun run dev` — start the Vite dev server
- `bun run check` — Biome lint and format check
- `bun run format` — Biome auto-fix (format and safe lints)
- `bun test` — run tests (fails under 75% coverage)
- `bun run build` — type-check and build for production
- `bun run preview` — preview the production build locally

## License

[MIT](LICENSE)
