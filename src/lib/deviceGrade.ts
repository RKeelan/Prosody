/**
 * Grading for Activity 6 (identify sentence-level devices).
 *
 * This is a hunt, not a fixed quiz: the learner tags spans with palette devices,
 * and the pack carries its own reference instance list. Vision.md scores the two
 * against each other as found / missed / false positive:
 *
 *   - found: a reference instance the learner tagged—a tag naming the same
 *     palette device over an overlapping span (overlap, not an exact match, so a
 *     clipped edge or a swept-in article never fails a real spot)
 *   - missed: a reference instance no tag matched
 *   - false positive: a tag matching no reference instance
 *
 * Each tag matches at most one reference instance and each instance at most one
 * tag, so tagging the same device twice over one spot cannot inflate the found
 * count. Matching is greedy in pack order—each reference takes the first unused
 * tag, in tag order, that fits—which is unambiguous for the near-disjoint spots a
 * real poem carries; the pathological overlapping-same-device case is not worth a
 * maximum-matching pass.
 *
 * The found count over the reference total is the activity's score. Each found
 * instance also pairs the learner's function note with the reference's for the
 * learner to self-grade after commit (the app shows both rather than judging a
 * one-line note); the component turns missed instances and note misses into the
 * session-summary miss list. This module resolves the references once and matches
 * purely in token space; the component owns the pixels and the self-grade taps.
 */

import { resolveAnchor } from "./anchor";
import type { DeviceTag } from "./deviceAnswer";
import { spansOverlap, type TokenSpan } from "./grade";
import type { DeviceInstance } from "./pack";
import type { Token } from "./tokenise";

/** A reference device instance resolved for grading. */
export interface ReferenceDevice {
  /** The palette entry id this instance realises. */
  readonly deviceId: string;
  /** The instance's span, or null when its anchor does not resolve (a broken pack). */
  readonly span: TokenSpan | null;
  /** The pack's one line on the work the device does, revealed on commit. */
  readonly functionNote: string;
}

/**
 * Resolve one reference instance into a {@link ReferenceDevice}. An instance whose
 * anchor fails to resolve keeps no span—the validator already reports that, so
 * grading treats it as an instance nothing can match rather than throwing
 * mid-session.
 */
export function resolveDevice(tokens: readonly Token[], instance: DeviceInstance): ReferenceDevice {
  const result = resolveAnchor(tokens, instance.anchor);
  return {
    deviceId: instance.deviceId,
    span: result.status === "resolved" ? result.span : null,
    functionNote: instance.functionNote,
  };
}

/** The learner's verdict on their own function note, shown beside the reference. */
export type SelfGrade = "match" | "partial" | "miss";

/** One reference instance's result: whether the learner found it, and which tag matched. */
export interface ReferenceResult {
  readonly found: boolean;
  /** The id of the learner tag that matched, when found. */
  readonly tagId?: string;
}

/** The whole activity's grade: the found count of the total, plus the false positives. */
export interface DeviceGrade {
  /** How many reference instances the poem carries. */
  readonly total: number;
  /** How many the learner found. */
  readonly found: number;
  /** One result per reference instance, in pack order. */
  readonly references: readonly ReferenceResult[];
  /** The ids of learner tags that matched no reference instance. */
  readonly falsePositives: readonly string[];
}

/** Whether a tag can realise a reference instance: same device, overlapping spans. */
function tagMatches(tag: DeviceTag, reference: ReferenceDevice): boolean {
  return (
    reference.span !== null &&
    tag.deviceId === reference.deviceId &&
    spansOverlap(tag.span, reference.span)
  );
}

/**
 * Match the learner's tags against the reference instances. Each reference takes
 * the first unused tag that fits (greedy, pack order); tags left over are false
 * positives.
 */
export function matchDevices(
  references: readonly ReferenceDevice[],
  tags: readonly DeviceTag[],
): DeviceGrade {
  const used = new Set<string>();
  const results = references.map((reference): ReferenceResult => {
    const match = tags.find((tag) => !used.has(tag.id) && tagMatches(tag, reference));
    if (!match) return { found: false };
    used.add(match.id);
    return { found: true, tagId: match.id };
  });
  return {
    total: references.length,
    found: results.filter((r) => r.found).length,
    references: results,
    falsePositives: tags.filter((tag) => !used.has(tag.id)).map((tag) => tag.id),
  };
}
