/**
 * The loaded-pack shell: header, activity nav, and the current activity's
 * screen. Split out from `App.tsx` so `useStore` is called unconditionally
 * within its own component—`App.tsx` only ever mounts this once a pack and
 * session store exist, which would otherwise make the hook's call order
 * depend on which screen is showing.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityNav } from "@/components/ActivityNav";
import { ActivityScreen } from "@/components/ActivityScreen";
import { Button } from "@/components/ui/button";
import { activityInfo } from "@/lib/activityInfo";
import type { Pack } from "@/lib/pack";
import type { ActivityKey, SessionStoreState } from "@/lib/session";

interface StudyShellProps {
  pack: Pack;
  store: StoreApi<SessionStoreState>;
  activity: ActivityKey;
  onSelectActivity: (key: ActivityKey) => void;
  onChangePoem: () => void;
}

export function StudyShell({
  pack,
  store,
  activity,
  onSelectActivity,
  onChangePoem,
}: StudyShellProps) {
  const session = useStore(store, (s) => s.session);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{pack.title}</h1>
          <p className="text-muted-foreground text-sm">
            {pack.poet} · Attempt {session.currentAttempt.index}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onChangePoem}>
          Change poem
        </Button>
      </header>

      <ActivityNav
        activeActivities={pack.activeActivities}
        current={activity}
        onSelect={onSelectActivity}
      />

      <ActivityScreen info={activityInfo(activity)} />
    </main>
  );
}
