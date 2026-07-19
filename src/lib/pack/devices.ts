/**
 * Activity 6 (sentence-level devices): the device palette and the reference
 * instances found in this poem.
 *
 * The palette carries exactly the device types relevant to the poem—each with
 * a definition and one canonical example drawn from another poem, so the example
 * never gives away an instance in the poem under study. Each instance names the
 * palette device it realises and a one-line note on the work it does.
 *
 * $Claude Referential integrity—that every instance's `deviceId` names a
 * palette entry—is left to the Task 3 validator, keeping this module pure data
 * shape.
 */

import { z } from "zod";
import { nonEmptyString, QuoteAnchor, singleLineString, slug } from "./common";

/** One canonical example of a device, drawn from a poem other than this one. */
export const CanonicalExample = z.object({
  text: nonEmptyString,
  /** Where the example comes from, e.g. "Donne, 'The Sun Rising'". */
  source: nonEmptyString,
});
export type CanonicalExample = z.infer<typeof CanonicalExample>;

/** A device type in the palette: its definition plus one outside example. */
export const DevicePaletteEntry = z.object({
  /** Stable id the instances reference. */
  id: slug,
  /** The device's name, e.g. "apostrophe". */
  name: nonEmptyString,
  /** The tap-to-expand definition. */
  definition: nonEmptyString,
  canonicalExample: CanonicalExample,
});
export type DevicePaletteEntry = z.infer<typeof DevicePaletteEntry>;

/** A device found in this poem: the palette type, the span, and its function. */
export const DeviceInstance = z.object({
  /** The palette entry id this instance realises. */
  deviceId: slug,
  anchor: QuoteAnchor,
  /** One line on what work the device is doing here. */
  functionNote: singleLineString,
});
export type DeviceInstance = z.infer<typeof DeviceInstance>;

export const Devices = z.object({
  palette: z.array(DevicePaletteEntry).min(1),
  instances: z.array(DeviceInstance).default([]),
});
export type Devices = z.infer<typeof Devices>;
