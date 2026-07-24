# Prosody — Poem Study Lesson Plan Template

A single-poem study session: syntax before interpretation, granular before broad.

Scope: a personal tool, not a product. Open source and hosted on the open Internet so it works from a phone, with no ambitions beyond that. Mobile is a first-class target: every interaction is built on tapping tokens (tap-start/tap-end to form a span), never on browser text selection, which fights native selection handles on touch. The same interaction model works unchanged on desktop.

Inputs per artifact: one poem, plus a reference data pack (sentence segmentation, pronoun antecedents, scansion, glossary, device instances, allusion notes, model argument) embedded as JSON.

Withholding principle (global): for every checkable activity, reference answers stay hidden until the learner commits their own answer. Committing is irreversible within an attempt; the diff view then shows both side by side.

## Architecture

- Shell/content split: the app is a static website hosted on Cloudflare Pages, built once; every PR gets a preview deployment, so changes are testable from a phone before merge. Each poem is a JSON data pack conforming to a shared schema (poem text, sentence segmentation, pronoun antecedents, scansion, glossary, device instances, allusion cards, model argument, active-activity flags).
- Tech stack: Vite + React + TypeScript, Tailwind, shadcn/ui. Bun throughout as package manager, script runner, and test runner (Dependabot configured for the bun ecosystem, not npm—the stale-`bun.lock` failure documented in the workspace AGENTS.md). Zod defines the pack schema once—runtime validation with inline errors on load, inferred TypeScript types, and the same schema drives the authoring CLI validator. Zustand holds cross-activity state (annotation layers, miss lists feeding the Activity 9 gate), with a hand-rolled localStorage persistence layer keyed per pack. Grading functions are pure TypeScript modules under `bun test`. No wasm Python: all grading is token and set arithmetic; Python appears only in the authoring pipeline. No router; at most a hash fragment deep-links an activity.
- Poem renderer: one custom token-based component underlies every activity. Tokenize once (words, plus syllable boundaries from the pack), render tokens as spans, and make every interaction token-index based. No contentEditable, no off-the-shelf annotation library—the interactions (syllable taps, rhyme letters, pronoun chips) are too specific for one to help.
- Span anchors: packs store reference spans as quote anchors—exact text plus prefix/suffix or occurrence index, after the W3C TextQuoteSelector pattern—resolved to token indices at load. Grading happens at token granularity, so a trailing comma or leading "the" never fails an overlap check. Anchors are also the format an LLM author can write reliably: Claude can quote text; it cannot count character offsets.
- Multiple acceptable answers: a schema-wide affordance, available anywhere the app auto-grades. Scansion carries per-syllable alternates (required reading plus acceptable variants—promoted stresses, spondee-versus-iamb calls); antecedents carry alternates where the ambiguity is the poem's point.
- Pack loading: MVP loads packs from a local file (file picker + drag-drop, `FileReader`, Zod validation with inline errors). Post-MVP adds a published library: `packs/` directory in the repo with an `index.json` manifest. Published packs are public-domain poems only, since the repo is public; in-copyright poems live permanently in local-file mode.
- Grading ladder: (1) auto-grade everything deterministic—span matches, stress/rhyme diffs, coverage checks, cross-activity consistency checks; (2) self-grade free text against revealed model answers; (3) post-MVP: LLM feedback. LLM rung 1 = one-click export of a structured session report (answers, references, scores, prompt preamble) to paste into a chat; rung 2 = in-app API calls with a user-supplied key.
- Sessions and attempts: an attempt is the unit of study. Commits are irreversible within an attempt; a finished attempt archives (scores and surviving miss list retained), and the same pack can be restudied in a fresh attempt—restudying a poem is the natural use pattern for this kind of deep reading. Progress lives in `localStorage`, keyed by pack ID + content hash (on hash change: offer keep-progress or start-fresh). Progress export/import as JSON download for backup.
- Build order: pack schema and CLI validator first, before any UI. Every consistency check lives in the validator, so packs are proven before the app ever loads them.

## Authoring pipeline

Packs are authored entirely by AI (Claude Fable, driven by the project skill). All authoring tooling is therefore CLI-first, designed for Claude to operate—no authoring webpages.

- Validator CLI: a bun script—bun executes TypeScript directly, so the validator needs no build step—sharing the Zod schema with the app. Checks that every anchor resolves uniquely in the poem text, every target pronoun has an antecedent entry, scansion syllable counts match the text, device and allusion spans exist, glossary coverage flags are consistent, and cross-activity references (e.g. the Activity 6 apostrophe that Activity 7 checks against) line up.
- Anchor resolution: Claude writes quotes plus occurrence indices; the tool resolves them against the poem text and reports ambiguous or unresolvable anchors for revision.
- Scansion checking: `prosodic` (constraint-based metrical parser, quadrismegistus/prosodic) and the CMU Pronouncing Dictionary serve as mechanical checks on Claude's scansion—syllable counts, stress plausibility, candidate parses. Caveats: lexical stress is not metrical stress, and archaic or poetic words are missing from CMUdict. The tools check; Claude decides.
- Source texts: PoetryDB and Project Gutenberg for canonical public-domain texts.
- Reference material: Representative Poetry Online (U of T) for scholarly glosses and annotations; Wiktionary and the OED (library access) for glossary entries, particularly the two-senses requirement on odd-usage words.
- Skill loop: acquire text → draft pack → run validator and mechanical checks → revise until clean.

## Activity 1: Read silently

Read the poem once, without aids. Mark (but do not resolve) any line where you stumble or lose the thread.

- Realized in artifact as: Clean poem text, no apparatus. Select any span → a marker menu offers "stumbled," "lost thread," "odd word." Annotations get a colour per type and persist for the rest of the session, but the marking UI belongs to Activity 1 alone: the marks resurface at the Activity 9 gate to be resolved or dismissed, not as a layer over the later activities.
- Evaluated by: Not graded. Completion = at least one pass confirmed. The annotation layer is the output; later activities check whether each mark got resolved.

## Activity 2: Read aloud

Read the poem aloud once. Compare the sound against what your silent reading assumed.

- Realized in artifact as: Two-phase view. Phase 1: bare text; tap syllables to mark where you think stresses fall, tap line-ends to assign rhyme letters. Phase 2 (after commit): reference scansion overlays—stress marks above syllables, rhyme scheme colour-coded at line ends, meter named (e.g., iambic tetrameter) with deviations from the base meter flagged.
- Known leak, accepted: rendering tappable syllables reveals the syllable count, and syllabification is itself part of scansion skill (elision, expansion, disyllabic-or-not calls). Marking syllable divisions is fiddly UI for modest gain, so the leak stands—except where the reference metre hinges on an elision or expansion choice, where a micro-question ("how many syllables here?") precedes the tap phase.
- Evaluated by: Auto-diff of stress markings vs. reference, with per-syllable alternates accepted (% agreement, mismatches highlighted). Rhyme grading compares partitions of line-ends, not letters—a learner who labels ABAB as BABA is right. Deviations from base meter come with a one-line note on what the deviation does.

## Activity 3: Resolve pronouns and demonstratives

For every *this*, *that*, *it*, *he/she/they*, *thee/thou*: identify the antecedent precisely.

- Realized in artifact as: All target pronouns rendered as clickable chips. Clicking opens two ways to answer: highlight the antecedent span directly in the poem text, or type it (for implied/extratextual antecedents). Progress meter: N of M resolved.
- Evaluated by: Span answers auto-checked against reference spans at token granularity (exact/overlap match), including acceptable alternates where the pack records genuine ambiguity. Typed answers shown next to the reference answer for self-grading (match / partial / miss). Artifact tracks the miss list.

## Activity 4: Identify subject, verb, and object of every sentence

Work sentence by sentence, not line by line.

- Realized in artifact as: Poem re-rendered with sentence boundaries marked (numbered brackets spanning lines). Per sentence: fields for subject, main verb, and object or complement—answered by span-highlight or typing "(implied) X", with a first-class "no object" answer for intransitives and copulars—plus a required one-line "who does what to whom" paraphrase in plain word order. Sentences flagged in the data pack as gnarly get an extra step: drag the clauses into a simple nesting tree.
- Evaluated by: Span answers auto-checked; "no object" checked against the pack's sentence record; paraphrases self-graded against a reference paraphrase. A sentence is "cleared" only when subject, verb, object-or-complement, and paraphrase all pass.

## Activity 5: Gloss the diction

Define every word you cannot define precisely, and every word used oddly.

- Realized in artifact as: Every word tappable → "add gloss" opens a definition field. Words the data pack marks as *odd usage* are visually dotted-underlined only *after* the learner commits their gloss list (so the hunt is theirs first); odd-usage entries require stating both senses the word carries.
- Evaluated by: Coverage check: did the learner gloss the words the pack flags as essential? Misses revealed as a list. Definitions self-graded against pack glosses.

## Activity 6: Identify sentence-level devices

Find and name the granular techniques: anastrophe, apostrophe, parallelism, anaphora, and others as relevant.

- Realized in artifact as: Spot mode—highlight a span, tag it from a device palette (each palette entry has a tap-to-expand definition + one canonical example from another poem), and write one line on what work the device is doing. Then commit → reference instances revealed with their function notes.
- Evaluated by: Auto-scored as found / missed / false positive against the reference instance list. Function notes self-graded.

## Activity 7: Identify broad devices

Establish speaker, addressee, and point of view.

- Realized in artifact as: A three-question form: Who speaks? To whom? What is the point of view doing for the poem? Free text, minimum lengths enforced. Commit → model answers revealed side-by-side.
- Evaluated by: Self-graded per question. If Activity 6 found an apostrophe, the addressee answer is cross-checked against it (the artifact flags contradictions).

## Activity 8: Chase the allusions

Identify each allusion; learn what the original audience knew; state what it imports.

- Realized in artifact as: Hunt phase: highlight suspected allusion spans. Commit → reference allusions revealed; each opens a card with (a) the source story/verse/figure as the original audience knew it, and (b) a hidden "what it imports" note that unlocks only after the learner types their own one-liner.
- Evaluated by: Found/missed on the hunt; import statements self-graded against the card.

## Activity 9: State the argument

What claim does the poem make about its big question?

- Realized in artifact as: A gate screen first: unresolved marks from Activity 1 and misses from Activities 3–4 are listed; the learner must clear or consciously dismiss each. Then a free-text field (1–2 sentences, enforced) naming the big question and the poem's claim about it. Commit → model argument revealed.
- Evaluated by: Self-graded. A final session-summary screen shows all activity scores and the surviving miss list.

## Prior art

- For Better for Verse (prosody.lib.virginia.edu, UVA): an interactive scansion tutor—students mark binary stress and check against TEI-encoded references. Study its UX, and especially how its per-poem notes defend contested scansions, before building Activity 2.
