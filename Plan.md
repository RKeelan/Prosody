# Implementation Plan

This plan turns [Vision.md](Vision.md) into an ordered series of pull requests. Vision.md remains the design authority: where this plan and Vision.md disagree, Vision.md wins—flag the conflict to Richard rather than silently choosing. Judgment calls Vision.md leaves open are marked `$Claude`.

## Working the plan

- One task is one PR, squash-merged, ideally a single commit whose message supplies the PR title and body. Follow the git conventions in the global CLAUDE.md, including approval of commit messages and PR bodies before creating them.
- When a task's PR is ready, edit this file to strike through that task's heading (`## ~~Task 4: fixture pack~~`) and include that edit in the same PR. Main then always shows live status.
- Never renumber tasks. If scope grows, add new tasks at the end of a stage with fresh numbers.
- Tasks land in order within a stage; stages land in order.
- Before committing: `bun run check`, `bun test`, `bun run build`. Grading and lib modules ship with tests—bunfig.toml enforces 75% coverage on every `bun test` run.
- Tasks with a "Richard tests" line deliver a user-facing feature. Once the PR is open, Cloudflare Pages builds a preview at a unique URL, linked from the PR's checks; hand Richard the listed flow to run there, usually from his phone, and fold his feedback in by amending the commit. Merge and move on only after his OK. The dev server remains the loop for local iteration.
- When implementation proves part of this plan wrong, update the plan text in the same PR and call the change out in the PR body.
- Keep README.md and AGENTS.md current as commands and layout change (e.g., a new `bun run validate` script).
- When a "Richard tests" flow needs fixtures the task doesn't otherwise produce (a deliberately broken pack, a second sample poem, seeded storage state), creating those fixtures is part of the task, not a separate ask.

## Already in place

The scaffold (commit b032309) provides Vite + React + TypeScript, Tailwind v4, shadcn/ui configured via components.json (no components added yet—add with `bunx shadcn@latest add <name>` as needed), Biome, `bun test` with the coverage gate, CI (check, test, build), GitHub Pages deploy at base `/Prosody/` (Task 5 replaces this with Cloudflare Pages), Dependabot on the bun ecosystem, and a grading seed at `src/lib/grade.ts` (token spans, overlap).

## ~~Stage 1: data layer~~

Vision.md's build order is explicit: pack schema and CLI validator before any UI, every consistency check in the validator, packs proven before the app ever loads them. This stage has no user-facing surface; the first "Richard tests" checkpoint arrives with Task 5.

### ~~Task 0: commit this plan~~

First PR: add Plan.md to the repo, along with the Vision.md edit switching hosting to Cloudflare Pages (decided at plan review).

### ~~Task 1: pack schema~~

Add `zod` (pinned exact, like all dependencies). Define the complete pack schema in `src/lib/pack/` with inferred TypeScript types:

- pack metadata: id, title, poet, schema version, active-activity flags
- poem text: lines with stanza breaks; per-word syllable divisions where scansion needs them
- quote anchors after the W3C TextQuoteSelector pattern: exact text plus prefix/suffix or occurrence index
- per-activity reference data: sentence segmentation with subject/verb/object records (first-class "no object"), reference paraphrases, gnarly flags with clause trees; pronoun antecedents with typed-answer support and alternates; scansion with per-syllable required stress plus acceptable alternates, metre name, deviations with one-line notes, rhyme partition, and elision micro-questions; glossary with essential and odd-usage flags and both senses for odd-usage words; device palette (each device type's definition plus one canonical example from another poem) and device instances with function notes; allusion cards with source note and imports note; model argument
- multiple acceptable answers as a schema-wide affordance, available anywhere the app auto-grades

Tests: a minimal valid pack parses; representative invalid packs fail with messages that point at the offending field. This is the largest design task in the plan; if the PR grows unwieldy, split it by schema section—but the schema must be complete before Stage 2 begins.

### ~~Task 2: tokeniser and anchor resolution~~

- tokenise poem text once: word and punctuation tokens with stable indices; grading compares word tokens only, so a trailing comma or leading "the" never fails an overlap check
- resolve quote anchors to token spans at load; report unresolvable and ambiguous anchors with enough context to fix the pack
- pure modules under `src/lib/`, fully tested

### ~~Task 3: validator CLI~~

- `scripts/validate.ts`, run as `bun scripts/validate.ts <pack.json>` plus a `bun run validate` package script—bun executes TypeScript directly, so no build step; must work on Windows and in CI
- checks, per Vision.md: every anchor resolves uniquely in the poem text; every target pronoun has an antecedent entry; scansion syllable counts match the text; device and allusion spans exist; every device instance references a palette entry the pack defines; glossary coverage flags are consistent; cross-activity references line up (the Activity 6 apostrophe that Activity 7 checks against)
- add a CI step validating every pack under `packs/`, so committed packs stay proven

### ~~Task 4: fixture pack~~

Author one complete pack (Ozymandias—sonnet) for a short public-domain poem and commit it under `packs/`, iterating against the validator until `bun run validate` is clean. This pack is the development fixture for every UI task that follows. Authoring is by hand here; the authoring skill and mechanical checks are post-MVP.

## Stage 2: app core

### ~~Task 5: Cloudflare Pages hosting and PR previews~~

Replace GitHub Pages with Cloudflare Pages, matching recipe-db, so every PR gets a preview deployment Richard can open from his phone.

- Richard's hands required first: create the Pages project in the Cloudflare dashboard and connect the GitHub repo—build command `bun install --frozen-lockfile && bun run build`, output directory `dist`, no environment variables
- in-repo: set the Vite `base` to `/` (Cloudflare serves from the domain root), delete `.github/workflows/deploy.yml`, and update the README's deployment notes; Vision.md already reflects the change
- previews are public to anyone holding the URL, which is fine for an open-source tool
- Richard tests: open this PR's preview URL on his phone and confirm the scaffold page loads

### ~~Task 6: session store and persistence~~

- Zustand store for cross-activity state: annotation layers, per-activity answers and commit status, miss lists feeding the Activity 9 gate
- attempt model: commits irreversible within an attempt; a finished attempt archives its scores and surviving miss list; the same pack restudies in a fresh attempt
- hand-rolled localStorage persistence keyed by pack id + content hash (`$Claude` hash the raw pack file text); serialisation logic pure and tested

### ~~Task 7: app shell and pack loading~~

- landing screen: file picker and drag-drop, `FileReader`, Zod validation with inline errors on load
- on content-hash change with existing progress: offer keep-progress or start-fresh
- activity navigation honouring the pack's active-activity flags; no router—at most a hash fragment deep-links an activity
- the fixture pack ships in the build with a one-tap load-sample affordance—dev server and PR previews alike need it, since juggling JSON files on a phone makes the picker a toll-gate (`$Claude`)
- first shadcn/ui components land here
- Richard tests: load the fixture pack by picker and by drag-drop; load a deliberately broken pack and read the inline errors; navigate between activities; reload and confirm state survives

### ~~Task 8: poem renderer~~

The one custom token-based component underlying every activity:

- tokens rendered as spans; every interaction token-index based—tap-start/tap-end to form a span; no browser text selection, no contentEditable, no off-the-shelf annotation library
- annotation layers: colour per type, toggleable, persisting across activities
- line and stanza layout that survives small screens; touch targets sized for a phone
- selection logic as pure tested modules; visual behaviour verified by hand at phone width
- the renderer has no activity to live in until Stage 3, so it ships behind a workbench (`PoemWorkbench`) that stands in for every activity screen: tap a span, mark it, toggle the layers. Task 9 absorbs the marker controls into the real Activity 1 (`$Claude`)
- Richard tests: at phone width, or better on his phone—tap-select spans within and across lines, adjust and clear a selection, toggle annotation layers

### Task 8.1: Handle overlapping marked spans

## Stage 3: activities

One task per activity: its UI, its grading as pure tested modules, wiring into the store (commits, miss lists), and the withholding principle throughout—reference answers render only after the learner commits, and the diff view then shows both side by side.

### ~~Task 9: Activity 1—read silently~~

- clean poem text, no apparatus; select a span, mark it stumbled, lost thread, or odd word; marks persist as a toggleable layer in all later activities
- ungraded; completion is one confirmed pass; unresolved marks feed the Activity 9 gate
- unmarking is by chip, not by re-selecting: each mark shows as a chip beneath the poem, tapped to remove it; a mark a later activity resolved shows inert, its record preserved (`$Claude`)
- Richard tests: a real silent read of the fixture poem, marking as he goes; confirm the marks reappear as a layer in a later activity view

### Task 10: Activity 2—read aloud

Study For Better for Verse (prosody.lib.virginia.edu) before building—especially how its per-poem notes defend contested scansions.

- phase 1: bare text; tap syllables to mark stress, tap line ends to assign rhyme letters; elision micro-questions precede the tap phase where the pack flags them
- phase 2 on commit: reference overlay—stress marks above syllables, rhyme scheme colour-coded, metre named, deviations flagged with their one-line notes
- grading: per-syllable stress diff with alternates accepted (% agreement, mismatches highlighted); rhyme graded as a partition of line ends, not letters—ABAB labelled BABA is right
- the heaviest activity; split the marking UI and the diff view into two PRs if needed
- Richard tests: a full stress-and-rhyme pass on the fixture poem, then commit; check the % agreement, mismatch highlighting, and deviation notes all read well at phone width

### Task 11: Activity 3—pronouns and demonstratives

- target pronouns rendered as chips; answer by highlighting the antecedent span or typing it for implied/extratextual antecedents; N-of-M progress meter
- span answers auto-checked (exact/overlap) with recorded alternates where ambiguity is the poem's point; typed answers self-graded match/partial/miss; misses tracked
- Richard tests: resolve every pronoun, mixing span and typed answers; commit and review the miss list

### Task 12: Activity 4—subject, verb, object

- sentence boundaries marked as numbered brackets spanning lines
- per sentence: subject, main verb, and object-or-complement, answered by span or typed "(implied) X", with first-class "no object"; plus a required one-line who-does-what-to-whom paraphrase
- gnarly sentences add a clause-nesting step; keep it tap-based—drag is not worth fighting on mobile
- a sentence clears only when all four parts pass; misses feed the gate
- Richard tests: clear at least one plain sentence, one gnarly sentence, and one "no object" answer end to end

### Task 13: Activity 5—gloss the diction

- every word tappable to add a gloss; odd-usage words dotted-underlined only after the learner commits, so the hunt is theirs first; odd-usage entries require both senses
- coverage check against pack-flagged essential words, misses revealed as a list; definitions self-graded against pack glosses
- Richard tests: a gloss pass and commit; review the coverage misses and odd-usage underlines; enter both senses on an odd-usage word

### Task 14: Activity 6—sentence-level devices

- spot mode: highlight a span, tag it from a device palette, write one line on what work the device does; palette content (each device type's definition plus one canonical example from another poem) comes from the pack, so each poem carries exactly the device types relevant to it
- on commit: reference instances revealed with function notes; auto-scored found / missed / false positive; function notes self-graded
- Richard tests: tag several devices including a deliberate false positive; commit and check the found/missed/false-positive scoring

### Task 15: Activity 7—broad devices

- three-question form: who speaks, to whom, what the point of view does; free text with minimum lengths enforced; model answers revealed side by side on commit
- self-graded per question; if Activity 6 found an apostrophe, the addressee answer is cross-checked and contradictions flagged
- Richard tests: answer all three questions; deliberately contradict the Activity 6 apostrophe and confirm the flag fires

### Task 16: Activity 8—allusions

- hunt phase: highlight suspected allusion spans; on commit, reference allusions revealed as cards—source story first, the "what it imports" note unlocking only after the learner types their own one-liner
- found/missed on the hunt; import statements self-graded against the card
- Richard tests: a hunt and commit; confirm each card's imports note stays locked until his own one-liner is typed

### Task 17: Activity 9—argument and session summary

- gate screen listing unresolved Activity 1 marks and misses from Activities 3–4; each must be cleared or consciously dismissed
- then the argument: 1–2 sentences (enforced) naming the big question and the poem's claim; model argument revealed on commit; self-graded
- session-summary screen: all activity scores and the surviving miss list; entry point to archive the attempt and start a fresh one
- Richard tests: arrive at the gate with unresolved marks and misses; clear some, dismiss the rest; commit an argument and review the summary; start a fresh attempt and confirm the old one archived

## Stage 4: wrap-up

### Task 18: progress export and import

Progress export as a JSON download and import to restore, for backup across devices.

- Richard tests: export progress, clear site data (or switch browsers), import, and confirm the attempt restores intact

### Task 19: full-session QA on a phone

This task is itself a Richard-tests checkpoint: Richard runs the entire fixture pack end to end—dev build first, then the production Cloudflare Pages build from a real phone. Fix what chafes; repeat until the full session flows.

## Post-MVP, not scheduled

- published pack library: `packs/` manifest (`index.json`) and an in-app picker; public-domain poems only
- LLM feedback rung 1 (one-click structured session-report export) and rung 2 (in-app API calls with a user-supplied key)
- authoring skill and pipeline: prosodic and CMU dictionary mechanical checks, PoetryDB and Project Gutenberg acquisition, RPO/Wiktionary/OED reference workflow
