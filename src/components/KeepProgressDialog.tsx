/**
 * The keep-progress-or-start-fresh prompt.
 *
 * Shown when a pack's content hash no longer matches any stored session but
 * progress exists under a different hash for the same pack id—the pack's
 * text changed since that progress was recorded (Vision.md: "on hash
 * change: offer keep-progress or start-fresh"). Purely presentational: which
 * stale session to offer is `sessionDecision.ts`'s call, and rekeying or
 * starting fresh is `App.tsx`'s.
 *
 * $Claude Neither design doc says whether this prompt may be dismissed
 * without choosing. It blocks Escape and has no close button, forcing an
 * explicit keep-or-fresh choice—silently falling through to either option
 * would make progress handling a guess.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeepProgressDialogProps {
  /** When this pack's progress was last started (epoch milliseconds). */
  staleStartedAt: number;
  onKeepProgress: () => void;
  onStartFresh: () => void;
}

export function KeepProgressDialog({
  staleStartedAt,
  onKeepProgress,
  onStartFresh,
}: KeepProgressDialogProps) {
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>This pack's text has changed</DialogTitle>
          <DialogDescription>
            You have progress from a session started {new Date(staleStartedAt).toLocaleString()},
            against an earlier version of this pack's text. Keep that progress against the new text,
            or start fresh?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onStartFresh}>
            Start fresh
          </Button>
          <Button onClick={onKeepProgress}>Keep progress</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
