/**
 * The landing screen: choose a pack to study.
 *
 * Three ways in—drag a pack file onto the drop zone, tap to pick one with the
 * native file picker, or load the bundled sample with one tap ($Claude
 * Plan.md Task 7: the sample affordance exists because juggling JSON files on
 * a phone makes the picker a toll-gate). All three read the file's text and
 * hand it to `onRawText`, which runs it through the same load pipeline; a
 * failed load's findings come back in `findings` for inline rendering here.
 * This component holds no load logic of its own—`App.tsx` owns the pipeline,
 * the session wiring, and the findings state.
 */

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_PACK_TEXT } from "@/lib/samplePack";
import type { Finding } from "@/lib/validate";

interface LandingScreenProps {
  /** Findings from the most recent failed load, or `null` before any attempt or after a clean one. */
  findings: readonly Finding[] | null;
  /** Called with a file's full text, however it was obtained. */
  onRawText: (rawText: string) => void;
}

function readFileText(file: File, onRawText: (rawText: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") onRawText(reader.result);
  };
  reader.readAsText(file);
}

export function LandingScreen({ findings, onRawText }: LandingScreenProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) readFileText(file, onRawText);
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) readFileText(file, onRawText);
    event.target.value = ""; // allow re-picking the same file after a failed load
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <h1 className="font-semibold text-3xl tracking-tight">Prosody</h1>
          <p className="text-muted-foreground">
            A single-poem study session: syntax before interpretation, granular before broad.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Load a poem</CardTitle>
            <CardDescription>Drag a pack file here, or tap to choose one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/** biome-ignore lint/a11y/useSemanticElements: a drop zone is not natively expressible as a button */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
                dragActive
                  ? "border-primary bg-accent"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <p>Drop a pack .json file here, or tap to choose one</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handlePick}
                className="hidden"
              />
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onRawText(SAMPLE_PACK_TEXT)}
            >
              Load sample poem (Ozymandias)
            </Button>
          </CardContent>
        </Card>

        {findings && findings.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">
                This pack didn't load ({findings.length} problem{findings.length === 1 ? "" : "s"})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {findings.map((finding, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: findings have no stable identity of their own
                  <li key={i} className="border-b pb-2 last:border-b-0 last:pb-0">
                    <span className="font-mono text-muted-foreground">{finding.location}</span>
                    <span className="block">{finding.message}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
