/**
 * Activity 9 (state the argument): the model argument revealed on commit.
 *
 * The argument names the poem's big question and the claim it makes about it —
 * the two halves the learner's own one-to-two sentences must supply.
 */

import { z } from "zod";
import { nonEmptyString } from "./common";

export const Argument = z.object({
  /** The big question the poem engages. */
  bigQuestion: nonEmptyString,
  /** The claim the poem makes about that question. */
  claim: nonEmptyString,
});
export type Argument = z.infer<typeof Argument>;
