# Broken-pack fixtures

Seven variants of `packs/ozymandias.json`, each with exactly one deliberate
defect, for manually exercising the landing screen's error path (drag a file
here onto the drop zone, or pick it with the file input) and confirming the
findings it renders match what's below.

Not real packs: `bun run validate` only scans `packs/`, so these never touch
CI. Each is `packs/ozymandias.json` with one hand-made mutation; if that pack
changes enough to break the isolation described below, regenerate the
affected file the same way—copy the source pack, reapply its one-line change.

- `invalid-json.json`: truncated mid-object. Not valid JSON; reported as a single `(file)` finding.
- `schema-invalid.json`: the required `poet` field is missing. A Zod schema failure, reported at `poet`.
- `unresolved-anchor.json`: the first pronoun's anchor text is misspelled ("themm"). Reported at `pronouns[0].pronoun` as unresolved.
- `scansion-mismatch.json`: line 0 of the scansion answer key is missing its last syllable (9 vs. the text's 10). Reported at `scansion.lines[0]`.
- `bad-rhyme.json`: line 4 appears in two rhyme groups. Reported at `scansion.rhyme[5]`.
- `dangling-device.json`: the first device instance's `deviceId` ("zeugma") names no palette entry. Reported at `devices.instances[0].deviceId`.
- `missing-broaddevices.json`: the `broadDevices` section is removed while Activity 7 is enabled and an apostrophe device instance still exists. Reported at both `activeActivities.broadDevices` and `broadDevices` (two related findings from one missing section).
