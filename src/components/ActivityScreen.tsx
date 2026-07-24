/**
 * One activity's screen: the real component where Stage 3 has built it, and a
 * placeholder naming its Plan.md task where it has not.
 *
 * A placeholder still renders the poem, with the Activity 1 annotation layers
 * and their toggles—the marks are meant to travel, and an activity that showed
 * none of the poem would be a worse stand-in than one that shows it plainly.
 * The poem is inert there: selecting is an interaction each activity defines
 * for itself, and none of the unbuilt ones has yet.
 *
 * Stage 3 replaces the placeholders one at a time by adding a case here,
 * without touching how an activity is reached (the nav and the fragment routing
 * in `App.tsx`). Built or not, every activity wears the same card chrome from
 * `./ActivityCard`; the activity's name comes from the nav stepper above it.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityCard } from "@/components/ActivityCard";
import { PoemPanel } from "@/components/PoemPanel";
import { PronounsActivity } from "@/components/PronounsActivity";
import { ReadAloudActivity } from "@/components/ReadAloudActivity";
import { ReadSilentlyActivity } from "@/components/ReadSilentlyActivity";
import type { ActivityInfo } from "@/lib/activityInfo";
import type { Pack } from "@/lib/pack";
import type { SessionStoreState } from "@/lib/session";
import type { TokenisedPoem } from "@/lib/tokenise";

interface ActivityScreenProps {
  info: ActivityInfo;
  pack: Pack;
  tokenised: TokenisedPoem;
  store: StoreApi<SessionStoreState>;
}

export function ActivityScreen({ info, pack, tokenised, store }: ActivityScreenProps) {
  if (info.key === "readSilently") {
    return <ReadSilentlyActivity tokenised={tokenised} store={store} />;
  }
  if (info.key === "scansion") {
    return <ReadAloudActivity pack={pack} tokenised={tokenised} store={store} />;
  }
  if (info.key === "pronouns") {
    return <PronounsActivity pack={pack} tokenised={tokenised} store={store} />;
  }
  return <ActivityPlaceholder info={info} tokenised={tokenised} store={store} />;
}

function ActivityPlaceholder({ info, tokenised, store }: Omit<ActivityScreenProps, "pack">) {
  const marks = useStore(store, (s) => s.session.currentAttempt.marks);

  return (
    <ActivityCard
      description={`Built in Plan.md Task ${info.planTask}. Until then, the poem and your Activity 1 marks stand in.`}
    >
      <PoemPanel tokenised={tokenised} marks={marks} />
    </ActivityCard>
  );
}
