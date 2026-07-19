/**
 * The app shell: a thin state machine over landing and loaded screens.
 *
 * All the real logic—the load pipeline, the resume/keep-or-fresh decision,
 * the fragment-to-activity mapping—lives in pure modules under `src/lib/`;
 * this component only wires their results into React state and the two
 * screens (`LandingScreen`, `StudyShell`) that render them. No router: at
 * most a hash fragment deep-links an activity (Vision.md), followed on load
 * and on `hashchange`.
 */

import { useCallback, useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { KeepProgressDialog } from "@/components/KeepProgressDialog";
import { LandingScreen } from "@/components/LandingScreen";
import { StudyShell } from "@/components/StudyShell";
import { activityKeyFromFragment, activityKeyToFragment } from "@/lib/activityFragment";
import { clearLastPackText, loadLastPackText, saveLastPackText } from "@/lib/lastPackStorage";
import { loadPackFromText } from "@/lib/loadPack";
import type { Pack } from "@/lib/pack";
import {
  ACTIVITY_KEYS,
  type ActivityKey,
  browserStorage,
  createSessionStore,
  freshSession,
  loadSession,
  rekeySession,
  type SessionData,
  type SessionStorage,
  type SessionStoreState,
  saveSession,
} from "@/lib/session";
import { decideSession } from "@/lib/sessionDecision";
import type { Finding } from "@/lib/validate";

interface LoadedState {
  pack: Pack;
  contentHash: string;
  store: StoreApi<SessionStoreState>;
}

/** A pack that resolved a stale-hash session, awaiting the learner's keep-or-fresh choice. */
interface PendingDecision {
  pack: Pack;
  contentHash: string;
  staleHash: string;
  staleStartedAt: number;
}

/** The fragment in `location.hash`, without its leading `#`. */
function currentFragment(): string {
  return window.location.hash.replace(/^#/, "");
}

/**
 * The activity the current hash fragment names, falling back to the pack's first enabled
 * activity. A fragment naming a disabled activity falls back too—the pack has no data for it.
 */
function activityFromLocation(pack: Pack): ActivityKey {
  const fromHash = activityKeyFromFragment(currentFragment());
  if (fromHash && pack.activeActivities[fromHash]) return fromHash;
  return ACTIVITY_KEYS.find((key) => pack.activeActivities[key]) ?? ACTIVITY_KEYS[0];
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [landingFindings, setLandingFindings] = useState<readonly Finding[] | null>(null);
  const [activity, setActivity] = useState<ActivityKey>(ACTIVITY_KEYS[0]);

  const finishLoad = useCallback(
    (pack: Pack, contentHash: string, initial: SessionData, storage: SessionStorage | null) => {
      const store = createSessionStore({ initial, storage: storage ?? undefined });
      setLoaded({ pack, contentHash, store });
      setPending(null);
      setLandingFindings(null);
      setActivity(activityFromLocation(pack));
    },
    [],
  );

  const handleRawText = useCallback(
    (rawText: string) => {
      const result = loadPackFromText(rawText);
      if (result.status === "error") {
        setLandingFindings(result.findings);
        return;
      }

      const { pack, contentHash } = result;
      const storage = browserStorage();
      if (!storage) {
        finishLoad(pack, contentHash, freshSession(pack.id, contentHash, Date.now()), null);
        return;
      }

      saveLastPackText(storage, rawText);
      const decision = decideSession(storage, pack.id, contentHash);
      if (decision.kind === "resume") {
        finishLoad(pack, contentHash, decision.session, storage);
      } else if (decision.kind === "fresh") {
        finishLoad(pack, contentHash, freshSession(pack.id, contentHash, Date.now()), storage);
      } else {
        setPending({
          pack,
          contentHash,
          staleHash: decision.staleHash,
          staleStartedAt: decision.staleSession.currentAttempt.startedAt,
        });
      }
    },
    [finishLoad],
  );

  // On mount, replay the last-loaded pack's cached raw text so a reload
  // restores the study session without re-picking the file. $Claude see
  // lastPackStorage.ts's doc comment for why this cache exists.
  useEffect(() => {
    const storage = browserStorage();
    if (!storage) return;
    const cached = loadLastPackText(storage);
    if (cached) handleRawText(cached);
  }, [handleRawText]);

  useEffect(() => {
    if (!loaded) return;
    const onHashChange = () => setActivity(activityFromLocation(loaded.pack));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [loaded]);

  const selectActivity = useCallback((key: ActivityKey) => {
    window.location.hash = activityKeyToFragment(key);
    setActivity(key);
  }, []);

  const changePoem = useCallback(() => {
    const storage = browserStorage();
    if (storage) clearLastPackText(storage);
    setLoaded(null);
    setLandingFindings(null);
    window.location.hash = "";
  }, []);

  const handleKeepProgress = useCallback(() => {
    if (!pending) return;
    const storage = browserStorage();
    if (!storage) return;
    rekeySession(storage, pending.pack.id, pending.staleHash, pending.contentHash);
    const result = loadSession(storage, pending.pack.id, pending.contentHash);
    const initial = result?.ok
      ? result.data
      : freshSession(pending.pack.id, pending.contentHash, Date.now());
    finishLoad(pending.pack, pending.contentHash, initial, storage);
  }, [pending, finishLoad]);

  const handleStartFresh = useCallback(() => {
    if (!pending) return;
    const storage = browserStorage();
    const fresh = freshSession(pending.pack.id, pending.contentHash, Date.now());
    // The store writes only on change, so an untouched fresh session would vanish on
    // reload and re-prompt keep-or-fresh; saving now makes the explicit choice stick.
    if (storage) saveSession(storage, fresh);
    finishLoad(pending.pack, pending.contentHash, fresh, storage);
  }, [pending, finishLoad]);

  if (loaded) {
    return (
      <StudyShell
        pack={loaded.pack}
        store={loaded.store}
        activity={activity}
        onSelectActivity={selectActivity}
        onChangePoem={changePoem}
      />
    );
  }

  return (
    <>
      <LandingScreen findings={landingFindings} onRawText={handleRawText} />
      {pending && (
        <KeepProgressDialog
          staleStartedAt={pending.staleStartedAt}
          onKeepProgress={handleKeepProgress}
          onStartFresh={handleStartFresh}
        />
      )}
    </>
  );
}
