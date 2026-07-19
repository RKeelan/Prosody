/**
 * The activity navigation: a phone-friendly grid of the nine activities.
 *
 * Every activity renders, always—disabled ones (per the pack's
 * `activeActivities` flags) are visibly inactive rather than hidden, per
 * Plan.md Task 7. Selecting an enabled activity calls `onSelect`; `App.tsx`
 * turns that into a hash-fragment navigation.
 *
 * $Claude Plan.md leaves the choice between a list and a grid open. A single
 * column below the `sm` breakpoint keeps every touch target full-width on a
 * phone; three columns above it fits all nine on one screen without a scroll
 * on desktop.
 */

import { ACTIVITIES } from "@/lib/activityInfo";
import type { ActiveActivities } from "@/lib/pack";
import type { ActivityKey } from "@/lib/session";
import { cn } from "@/lib/utils";

interface ActivityNavProps {
  activeActivities: ActiveActivities;
  current: ActivityKey;
  onSelect: (key: ActivityKey) => void;
}

export function ActivityNav({ activeActivities, current, onSelect }: ActivityNavProps) {
  return (
    <nav aria-label="Activities" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {ACTIVITIES.map((info) => {
        const enabled = activeActivities[info.key];
        const selected = info.key === current;
        return (
          <button
            key={info.key}
            type="button"
            disabled={!enabled}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(info.key)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              enabled ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-40",
              selected && enabled && "border-primary bg-accent",
            )}
          >
            <span className="font-mono text-muted-foreground">{info.number}</span>
            <span>{info.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
