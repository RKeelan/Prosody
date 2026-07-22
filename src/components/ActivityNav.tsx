/**
 * The activity navigation: a one-row stepper—previous, the current activity's
 * name, next.
 *
 * The nine activities are a fixed sequence studied in order, so the nav is a
 * stepper, not a menu: two arrows and a label, rather than nine stacked cards
 * that ate the whole first screen on a phone before the poem came into view.
 * The arrows step to the adjacent *enabled* activity (a pack may switch some
 * off through its `activeActivities` flags), skipping any the pack disabled and
 * greying out at the first and last. Selecting calls `onSelect`; `App.tsx` turns
 * that into a hash-fragment navigation.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activityInfo, adjacentActivity } from "@/lib/activityInfo";
import type { ActiveActivities } from "@/lib/pack";
import type { ActivityKey } from "@/lib/session";

interface ActivityNavProps {
  activeActivities: ActiveActivities;
  current: ActivityKey;
  onSelect: (key: ActivityKey) => void;
}

export function ActivityNav({ activeActivities, current, onSelect }: ActivityNavProps) {
  const info = activityInfo(current);
  const previous = adjacentActivity(activeActivities, current, -1);
  const next = adjacentActivity(activeActivities, current, 1);

  return (
    <nav aria-label="Activities" className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        disabled={previous === null}
        aria-label="Previous activity"
        onClick={() => previous && onSelect(previous)}
      >
        <ChevronLeft />
      </Button>

      <p className="min-w-0 flex-1 truncate text-center font-medium text-sm">
        <span className="text-muted-foreground">Activity {info.number}: </span>
        {info.title}
      </p>

      <Button
        variant="outline"
        size="icon"
        disabled={next === null}
        aria-label="Next activity"
        onClick={() => next && onSelect(next)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
