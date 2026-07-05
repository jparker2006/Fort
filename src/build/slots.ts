// Slot addressing: canonical string keys, cell-edge resolution, and the world
// transform of each slot. Pure functions over the grid constants (the single
// source of truth from T03), no THREE dependency.

import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import type { Slot, WallSlot, CellSlot, WallAxis, Rotation } from "./piece.ts";

export type SlotKey = string;

/** Cardinal wall edges of a cell. */
export type WallDir = "N" | "S" | "E" | "W";

/** Canonical key for a slot; equal slots (including shared wall edges) match. */
export function slotKey(slot: Slot): SlotKey {
  if (slot.kind === "wall") {
    return `w${slot.axis}:${slot.line}:${slot.span}:${slot.cy}`;
  }
  const tag = slot.kind === "floor" ? "f" : slot.kind === "stairs" ? "s" : "r";
  return `${tag}:${slot.cx}:${slot.cy}:${slot.cz}`;
}

/** Inverse of slotKey. Round-trips every slot back to structural equality. */
export function decodeSlotKey(key: SlotKey): Slot {
  const parts = key.split(":");
  const tag = parts[0]!;
  const n = parts.slice(1).map(Number);
  if (tag === "wx" || tag === "wz") {
    return { kind: "wall", axis: tag === "wx" ? "x" : "z", line: n[0]!, span: n[1]!, cy: n[2]! };
  }
  const kind = tag === "f" ? "floor" : tag === "s" ? "stairs" : "roof";
  return { kind, cx: n[0]!, cy: n[1]!, cz: n[2]! };
}

/** The wall slot on a cell's cardinal edge, canonicalized to the shared edge. */
export function wallOnEdge(cx: number, cy: number, cz: number, dir: WallDir): WallSlot {
  switch (dir) {
    case "W":
      return { kind: "wall", axis: "x", line: cx, span: cz, cy };
    case "E":
      return { kind: "wall", axis: "x", line: cx + 1, span: cz, cy };
    case "S":
      return { kind: "wall", axis: "z", line: cz, span: cx, cy };
    case "N":
      return { kind: "wall", axis: "z", line: cz + 1, span: cx, cy };
  }
}

/** The (up to two) cells a wall edge borders. */
export function wallBorderCells(w: WallSlot): Array<{ cx: number; cz: number }> {
  if (w.axis === "x") {
    return [
      { cx: w.line - 1, cz: w.span },
      { cx: w.line, cz: w.span },
    ];
  }
  return [
    { cx: w.span, cz: w.line - 1 },
    { cx: w.span, cz: w.line },
  ];
}

export function floorSlot(cx: number, cy: number, cz: number): CellSlot {
  return { kind: "floor", cx, cy, cz };
}
export function stairsSlot(cx: number, cy: number, cz: number): CellSlot {
  return { kind: "stairs", cx, cy, cz };
}
export function roofSlot(cx: number, cy: number, cz: number): CellSlot {
  return { kind: "roof", cx, cy, cz };
}
export function wallSlot(axis: WallAxis, line: number, span: number, cy: number): WallSlot {
  return { kind: "wall", axis, line, span, cy };
}

/** World placement of a slot's mesh instance: base-anchored (geometry bottom at
 * y=0), so the instance sits at y = cy*CELL_HEIGHT with a quarter-turn facing. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export function slotPlacement(slot: Slot, rotation: Rotation): Placement {
  const C = CELL_SIZE;
  const H = CELL_HEIGHT;
  if (slot.kind === "wall") {
    if (slot.axis === "z") {
      // Panel spans X across cell `span`, sitting on the Z grid line.
      return { x: slot.span * C + C / 2, y: slot.cy * H, z: slot.line * C, rotY: 0 };
    }
    // axis "x": spans Z across cell `span`, on the X grid line (rotate 90).
    return { x: slot.line * C, y: slot.cy * H, z: slot.span * C + C / 2, rotY: Math.PI / 2 };
  }
  const x = slot.cx * C + C / 2;
  const z = slot.cz * C + C / 2;
  const y = slot.cy * H;
  if (slot.kind === "floor") return { x, y, z, rotY: 0 };
  return { x, y, z, rotY: rotation * (Math.PI / 2) };
}
