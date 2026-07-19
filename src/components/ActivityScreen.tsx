/**
 * One activity's screen. Every activity is still a placeholder—it names itself
 * and the Plan.md task that will build its real UI—but from Task 8 the card's
 * body is the poem renderer and its workbench, so the poem is on screen in
 * every activity and the renderer gets exercised wherever the learner is.
 * Stage 3 replaces this component's body, one activity at a time, without
 * touching how it is reached (the nav and the fragment routing in `App.tsx`).
 */

import type { StoreApi } from "zustand/vanilla";
import { PoemWorkbench } from "@/components/PoemWorkbench";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityInfo } from "@/lib/activityInfo";
import type { SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";

interface ActivityScreenProps {
  info: ActivityInfo;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

export function ActivityScreen({ info, tokenised, store }: ActivityScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Activity {info.number}: {info.title}
        </CardTitle>
        <CardDescription>
          Built in Plan.md Task {info.planTask}. Until then, the poem renderer stands in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PoemWorkbench tokenised={tokenised} store={store} />
      </CardContent>
    </Card>
  );
}
