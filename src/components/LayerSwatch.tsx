/**
 * The coloured dot standing for one annotation layer.
 *
 * It is the visual key tying the three places a mark kind appears—the marker
 * buttons, the layer toggles, and the mark list—so its size and shape live here
 * rather than in three JSX literals free to drift apart.
 */

import { layerFor } from "@/lib/annotationLayers";
import type { MarkKind } from "@/lib/session";
import { cn } from "@/lib/utils";

interface LayerSwatchProps {
  kind: MarkKind;
  className?: string;
}

export function LayerSwatch({ kind, className }: LayerSwatchProps) {
  const layer = layerFor(kind);
  return (
    <span
      className={cn("size-3 rounded-full", layer.swatchClassName, className)}
      title={layer.label}
    />
  );
}
