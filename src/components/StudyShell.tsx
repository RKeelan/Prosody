/**
 * The loaded-pack shell: header, activity nav, and the current activity's
 * screen. Split out from `App.tsx` so `useStore` is called unconditionally
 * within its own component—`App.tsx` only ever mounts this once a pack and
 * session store exist, which would otherwise make the hook's call order
 * depend on which screen is showing.
 */

import { useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ActivityNav } from "@/components/ActivityNav";
import { ActivityScreen } from "@/components/ActivityScreen";
import { NewAttemptDialog } from "@/components/NewAttemptDialog";
import { Button } from "@/components/ui/button";
import { activityInfo } from "@/lib/activityInfo";
import type { Pack } from "@/lib/pack";
import type { ActivityKey, SessionStoreState } from "@/lib/session";
import { tokenisePoem } from "@/lib/tokenise";

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
  const finishAttempt = useStore(store, (s) => s.actions.finishAttempt);
  // Tokenise once per pack, per Vision.md, and hand the same stream to every
  // activity: anchor resolution and grading already speak these indices.
  const tokenised = useMemo(() => tokenisePoem(pack.poem), [pack.poem]);

  const [resetOpen, setResetOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{pack.title}</h1>
          <p className="text-muted-foreground text-sm">
            {pack.poet} · Attempt {session.currentAttempt.index}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
            New attempt
          </Button>
          <Button variant="outline" size="sm" onClick={onChangePoem}>
            Change poem
          </Button>
        </div>
      </header>

      <NewAttemptDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        attemptIndex={session.currentAttempt.index}
        onConfirm={finishAttempt}
      />

      <ActivityNav
        activeActivities={pack.activeActivities}
        current={activity}
        onSelect={onSelectActivity}
      />

      <ActivityScreen info={activityInfo(activity)} tokenised={tokenised} store={store} />
    </main>
  );
}
