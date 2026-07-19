/**
 * Activity 7 (broad devices): the model answers for speaker, addressee, and
 * point of view, revealed side by side on commit.
 *
 * $Claude Plan.md's Task 1 bullet list names the "model argument" (Activity 9)
 * but omits Activity 7's model answers. Vision.md requires them—the activity
 * reveals model answers on commit—and the Task 3 validator cross-checks the
 * `addressee` here against any apostrophe found in Activity 6. The schema must be
 * complete before Stage 2, so this section is included; flagged in the report.
 */

import { z } from "zod";
import { nonEmptyString } from "./common";

export const BroadDevices = z.object({
  /** Model answer: who speaks. */
  speaker: nonEmptyString,
  /**
   * Model answer: to whom the poem is addressed. Cross-checked by the validator
   * against an Activity 6 apostrophe, where one exists.
   */
  addressee: nonEmptyString,
  /** Model answer: what the point of view does for the poem. */
  pointOfView: nonEmptyString,
});
export type BroadDevices = z.infer<typeof BroadDevices>;
