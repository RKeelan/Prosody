/**
 * Confirm starting a fresh attempt.
 *
 * A commit is irreversible within an attempt (the withholding principle: you
 * cannot reveal a reference answer, then quietly redo it). Studying the poem
 * again means starting a fresh attempt, which archives the current one and
 * begins a blank pass—the same mechanism Activity 9's summary will offer once it
 * lands. Because a fresh attempt sets aside committed work, it is guarded by this
 * confirm rather than firing on a single tap. Purely presentational: archiving
 * and restarting is the store's {@link SessionActions.finishAttempt}.
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

interface NewAttemptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current attempt's 1-based number, for the prompt. */
  attemptIndex: number;
  onConfirm: () => void;
}

export function NewAttemptDialog({
  open,
  onOpenChange,
  attemptIndex,
  onConfirm,
}: NewAttemptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a fresh attempt?</DialogTitle>
          <DialogDescription>
            Attempt {attemptIndex}'s answers—including anything you have committed—are set aside,
            and a new, blank pass begins on the same poem. A committed answer can't be changed
            within an attempt; a fresh attempt is how you study the poem again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Start fresh attempt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
