/**
 * A reusable minimal-valid-pack builder for tests.
 *
 * {@link minimalPack} returns a small but complete pack that exercises every
 * section once—a two-line poem with scansion, pronouns, sentences (one plain
 * with an object, one intransitive with "no object" and a clause tree), a
 * glossary (including an odd-usage word), devices, broad devices, an allusion,
 * and a model argument. It returns a plain input object so a test can corrupt one
 * field and assert the resulting error path; {@link parsedMinimalPack} returns
 * the validated, fully-typed pack for consumers that want the output shape.
 *
 * Later tasks (validator, fixtures, UI) reuse this builder, so it lives beside
 * the schema rather than inside a single test file.
 */

import type { z } from "zod";
import { Pack } from "./index";

/** The input (pre-parse) shape of a pack. */
export type PackInput = z.input<typeof Pack>;

const span = (exact: string) => ({ kind: "span" as const, anchor: { exact } });
const typed = (text: string) => ({ kind: "text" as const, text });

/**
 * Build a fresh, complete, valid pack. Each call returns a new object, so a test
 * may mutate the result freely. `overrides` shallow-merge over the top-level
 * fields.
 */
export function minimalPack(overrides: Partial<PackInput> = {}): PackInput {
  const base: PackInput = {
    schemaVersion: 1,
    id: "the-lost-boat",
    title: "The Lost Boat",
    poet: "Anonymous",
    poem: {
      stanzas: [
        {
          lines: ["O boat, you carried all my hope,", "It sank beneath the cold grey waves."],
        },
      ],
      syllabifications: [
        { word: { exact: "carried" }, syllables: ["car", "ried"] },
        { word: { exact: "beneath" }, syllables: ["be", "neath"] },
      ],
    },
    scansion: {
      metreName: "iambic tetrameter",
      lines: [
        {
          syllables: [
            { answer: "stressed", alternates: ["unstressed"] },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
          ],
        },
        {
          syllables: [
            { answer: "unstressed" },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
            { answer: "unstressed" },
            { answer: "stressed" },
          ],
        },
      ],
      deviations: [
        {
          anchor: { exact: "O boat" },
          note: "The stressed opening inverts the first foot into a trochee.",
        },
      ],
      rhyme: [[0], [1]],
      elisionQuestions: [
        {
          anchor: { exact: "carried" },
          prompt: "How many syllables does 'carried' carry here?",
          syllableCount: { answer: 2 },
        },
      ],
    },
    pronouns: [
      {
        pronoun: { exact: "you" },
        antecedent: { answer: span("boat"), alternates: [typed("the addressed boat")] },
      },
      { pronoun: { exact: "It" }, antecedent: { answer: span("boat") } },
      { pronoun: { exact: "my" }, antecedent: { answer: typed("(implied) the speaker") } },
    ],
    sentences: [
      {
        anchor: { exact: "O boat, you carried all my hope," },
        subject: { answer: span("you") },
        verb: { answer: span("carried") },
        object: { kind: "present", target: { answer: span("all my hope") } },
        paraphrase: "The boat carried all the speaker's hope.",
        gnarly: {
          label: "main clause: you carried all my hope",
          children: [
            { label: "vocative: O boat", anchor: { exact: "O boat" } },
            {
              label: "predicate",
              children: [{ label: "verb: carried" }, { label: "object: all my hope" }],
            },
          ],
        },
      },
      {
        anchor: { exact: "It sank beneath the cold grey waves." },
        subject: { answer: span("It") },
        verb: { answer: span("sank") },
        object: { kind: "none" },
        paraphrase: "The boat sank beneath the cold grey waves.",
      },
    ],
    glossary: [
      { word: { exact: "hope" }, essential: true, senses: ["expectation of a good outcome"] },
      {
        word: { exact: "carried" },
        oddUsage: true,
        senses: ["physically transported", "sustained or bore up emotionally"],
      },
      {
        word: { exact: "waves" },
        essential: true,
        senses: ["ridges of water on the sea's surface"],
      },
    ],
    devices: {
      palette: [
        {
          id: "apostrophe",
          name: "apostrophe",
          definition: "a direct address to an absent, dead, or non-human addressee",
          canonicalExample: {
            text: "Milton! thou shouldst be living at this hour",
            source: "Wordsworth, 'London, 1802'",
          },
        },
      ],
      instances: [
        {
          deviceId: "apostrophe",
          anchor: { exact: "O boat" },
          functionNote: "Addresses the lost boat directly, animating the speaker's grief.",
        },
      ],
    },
    broadDevices: {
      speaker: "an unnamed mourner recalling a loss",
      addressee: "the lost boat",
      pointOfView: "first-person retrospective, binding the speaker's fate to the boat's",
    },
    allusions: [
      {
        anchor: { exact: "cold grey waves" },
        source: "the classical sea-crossing into the underworld",
        imports: "casts the sinking as a passage into death rather than mere mishap",
      },
    ],
    argument: {
      bigQuestion: "Can devotion outlast what it was placed in?",
      claim: "The poem claims that hope sinks with the vessel that carried it.",
    },
  };
  return { ...base, ...overrides };
}

/** The minimal pack, parsed to its validated output shape. */
export function parsedMinimalPack(overrides: Partial<PackInput> = {}): Pack {
  return Pack.parse(minimalPack(overrides));
}
