// The seam between a selection-grid tile set and a canonical piece variant.
// T13 (edit mechanics) needs only the identity case: an empty grid is the full,
// uncarved piece (whose variant id is the type itself, per the build model's
// pool naming). T14 fills in the complete Fortnite mapping for both directions.

import type { PieceType } from "../build/piece.ts";
import { fullVariant, type VariantId } from "../build/build-model.ts";

/** Tiles pre-selected to represent a variant's current shape (baseline for
 * reset). The full (uncarved) piece is the empty selection. */
export function variantToSelection(type: PieceType, variant: VariantId): Set<number> {
  void variant;
  // T14 returns the real per-variant tile sets; until then every piece is full.
  void type;
  return new Set<number>();
}

/** The variant a selected tile set maps to, or null when the selection has no
 * canonical shape (confirm refuses null, matching Fortnite). */
export function selectionToVariant(type: PieceType, selection: Set<number>): VariantId | null {
  if (selection.size === 0) return fullVariant(type);
  return null; // T14 supplies the full catalog
}
