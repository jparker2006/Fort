// Placement validity: bounds, occupancy, and Fortnite-style support. All pure
// over an `occupied` predicate so the rules are testable without a live model.

import { CELL_MIN, CELL_MAX } from "../world/grid.ts";
import type { Slot } from "./piece.ts";
import {
  slotKey,
  wallOnEdge,
  wallBorderCells,
  floorSlot,
  stairsSlot,
  roofSlot,
  wallSlot,
  type SlotKey,
} from "./slots.ts";

/** Highest storey a piece may occupy (build height limit). */
export const BUILD_MAX_LEVEL = 40;

export type Occupied = (key: SlotKey) => boolean;

export type RejectReason = "occupied" | "out-of-bounds" | "unsupported" | "cooling";

export interface Validity {
  ok: boolean;
  reason?: RejectReason;
}

export function checkPlacement(slot: Slot, occupied: Occupied): Validity {
  if (occupied(slotKey(slot))) return { ok: false, reason: "occupied" };
  if (!inBounds(slot)) return { ok: false, reason: "out-of-bounds" };
  if (!isSupported(slot, occupied)) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

function inBounds(slot: Slot): boolean {
  if (slot.cy < 0 || slot.cy > BUILD_MAX_LEVEL) return false;
  if (slot.kind === "wall") {
    // A wall is valid if it borders at least one in-bounds cell.
    return wallBorderCells(slot).some((c) => cellInRange(c.cx, c.cz));
  }
  return cellInRange(slot.cx, slot.cz);
}

function cellInRange(cx: number, cz: number): boolean {
  return cx >= CELL_MIN && cx <= CELL_MAX && cz >= CELL_MIN && cz <= CELL_MAX;
}

/** Ground contact (any piece whose base sits on the island) or a structural
 * neighbor. Mirrors Fortnite creative freebuild: lone pieces stick to the
 * ground, higher pieces need an existing piece to hang off of. */
export function isSupported(slot: Slot, occupied: Occupied): boolean {
  if (slot.cy === 0) return true; // base at y=0 rests on the island
  for (const key of supportNeighbors(slot)) {
    if (occupied(key)) return true;
  }
  return false;
}

// Slots that, if occupied, physically hold this piece up. Generous but grounded
// in touching geometry: wall tops meeting floor/roof bases, coplanar bases, and
// stacked/adjacent runs.
function supportNeighbors(slot: Slot): SlotKey[] {
  const keys: SlotKey[] = [];
  const add = (s: Slot): void => {
    keys.push(slotKey(s));
  };

  if (slot.kind === "floor" || slot.kind === "stairs" || slot.kind === "roof") {
    const { cx, cy, cz } = slot;
    // Walls whose tops (level cy-1) meet this base, and walls coplanar at cy.
    for (const dir of ["N", "S", "E", "W"] as const) {
      add(wallOnEdge(cx, cy - 1, cz, dir));
      add(wallOnEdge(cx, cy, cz, dir));
    }
    // A ramp or roof one storey down whose apex reaches this base.
    add(stairsSlot(cx, cy - 1, cz));
    add(roofSlot(cx, cy - 1, cz));
  }

  if (slot.kind === "floor" || slot.kind === "stairs") {
    const { cx, cy, cz } = slot;
    // A floor in the same cell (this piece rests on it).
    add(floorSlot(cx, cy, cz));
    // Coplanar neighbors extend the deck.
    add(floorSlot(cx + 1, cy, cz));
    add(floorSlot(cx - 1, cy, cz));
    add(floorSlot(cx, cy, cz + 1));
    add(floorSlot(cx, cy, cz - 1));
  }

  if (slot.kind === "roof") {
    // A roof sits on the walls or floor of its own cell.
    add(floorSlot(slot.cx, slot.cy, slot.cz));
  }

  if (slot.kind === "wall") {
    // Stacked walls, and floors/ramps at this level that the wall stands on.
    add(wallSlot(slot.axis, slot.line, slot.span, slot.cy - 1));
    add(wallSlot(slot.axis, slot.line, slot.span - 1, slot.cy)); // collinear run
    add(wallSlot(slot.axis, slot.line, slot.span + 1, slot.cy));
    for (const c of wallBorderCells(slot)) {
      add(floorSlot(c.cx, slot.cy, c.cz));
      add(stairsSlot(c.cx, slot.cy, c.cz));
    }
  }

  return keys;
}
