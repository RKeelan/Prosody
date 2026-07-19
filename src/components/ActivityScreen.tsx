/**
 * One activity's screen. For Task 7, every activity is a placeholder: naming
 * itself and the Plan.md task that will build its real UI. Stage 3 replaces
 * this component's body, one activity at a time, without touching how it is
 * reached (the nav and the fragment routing in `App.tsx`).
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityInfo } from "@/lib/activityInfo";

interface ActivityScreenProps {
  info: ActivityInfo;
}

export function ActivityScreen({ info }: ActivityScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Activity {info.number}: {info.title}
        </CardTitle>
        <CardDescription>Built in Plan.md Task {info.planTask}.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This activity isn't built yet. Select another from the nav above.
        </p>
      </CardContent>
    </Card>
  );
}
