/**
 * The card every activity screen sits in: the heading Vision.md gives the
 * activity, the activity's own one-line brief, and its body.
 *
 * The heading comes from {@link ActivityInfo} rather than from each activity's
 * own source, so the nav and the screen cannot drift: renumber or retitle an
 * activity in `@/lib/activityInfo` and both follow. What varies per activity is
 * the description and the body, and those are all an activity supplies.
 */

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityInfo } from "@/lib/activityInfo";

interface ActivityCardProps {
  info: ActivityInfo;
  /** The activity's brief: what the learner is being asked to do here. */
  description: string;
  children: ReactNode;
}

export function ActivityCard({ info, description, children }: ActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Activity {info.number}: {info.title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
