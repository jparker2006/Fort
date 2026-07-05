// Single source of truth for the build grid lattice.
//
// Every system that snaps to cells (the ground grid overlay here, plus the
// build model, targeting, and editing in later tickets) imports these
// constants and helpers. Nothing may hardcode 4 or 3 for cell dimensions.
//
// Scale rationale: Fortnite build pieces are 512 x 512 x 384 in Unreal units
// (1 uu = 1 cm), a 4:4:3 footprint-to-height ratio. Fort keeps that ratio with a
// cell 4.8 x 4.8 wide and 3.6 tall so that, against the 1.8 m player, a wall
// reads exactly half the player's height (3.6 / 1.8 = 2.00) and one cell is 2.67
// players wide (4.8 / 1.8), matching Fortnite's proportions at 93.75 percent
// absolute scale (T23). The 4:3 footprint-to-height ratio is preserved.

/** Horizontal footprint of one cell, in world units (X and Z). */
export const CELL_SIZE = 4.8;

/** Vertical height of one cell (one wall/floor storey), in world units. */
export const CELL_HEIGHT = 3.6;

/** Island span in cells per side. */
export const ISLAND_CELLS = 40;

/** Island span in world units per side. */
export const ISLAND_SIZE = CELL_SIZE * ISLAND_CELLS;

/** Half the island span; the island is centered on the origin. */
export const ISLAND_HALF = ISLAND_SIZE / 2;

/** Inclusive minimum cell index along an axis (island is centered). */
export const CELL_MIN = -ISLAND_CELLS / 2;

/** Inclusive maximum cell index along an axis. */
export const CELL_MAX = ISLAND_CELLS / 2 - 1;

export interface Cell {
  cx: number;
  cz: number;
}

/** World X/Z of a cell's minimum corner (its origin). Y is left to the caller. */
export function cellOrigin(cx: number, cz: number): { x: number; z: number } {
  return { x: cx * CELL_SIZE, z: cz * CELL_SIZE };
}

/** World X/Z of a cell's center. */
export function cellCenter(cx: number, cz: number): { x: number; z: number } {
  return { x: (cx + 0.5) * CELL_SIZE, z: (cz + 0.5) * CELL_SIZE };
}

/** Cell index containing a world X/Z coordinate. */
export function worldToCell(x: number, z: number): Cell {
  return { cx: Math.floor(x / CELL_SIZE), cz: Math.floor(z / CELL_SIZE) };
}

/** True when a cell index pair lies within the island bounds. */
export function cellInBounds(cx: number, cz: number): boolean {
  return cx >= CELL_MIN && cx <= CELL_MAX && cz >= CELL_MIN && cz <= CELL_MAX;
}

/** Clamp a world X or Z so a point stays on the island (used by movement). */
export function clampToIsland(v: number): number {
  return Math.max(-ISLAND_HALF, Math.min(ISLAND_HALF, v));
}
