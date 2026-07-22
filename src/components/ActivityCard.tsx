/**
 * The card every activity screen sits in: the activity's one-line brief and its
 * body.
 *
 * Naming the activity is the nav stepper's job now (`./ActivityNav`), which
 * shows "Activity N: Title" directly above this card. So the card carries no
 * heading of its own—repeating it only stacked the same title twice. What
 * varies per activity is the brief and the body, and those are all an activity
 * supplies.
 */

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface ActivityCardProps {
  /** The activity's brief: what the learner is being asked to do here. */
  description: string;
  children: ReactNode;
}

export function ActivityCard({ description, children }: ActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
