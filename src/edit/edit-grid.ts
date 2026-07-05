// Selection-grid geometry for edit mode. Each editable piece exposes a grid of
// tiles laid out on a face frame in world space: walls a 3x3 vertical grid,
// floors / stairs / roofs a 2x2 grid. Pure math (no THREE) so tile addressing
// and crosshair hit-testing are unit-testable. The variant catalog (T14) maps a
// selected tile set to a canonical piece shape; this module only locates tiles.

import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import type { PieceType, Slot } from "../build/piece.ts";
import type { Vec3 } from "../build/targeting.ts";

export interface FaceFrame {
  /** World corner at tile (col 0, row 0). */
  origin: Vec3;
  /** Full span vector across the columns (origin + uAxis = far column edge). */
  uAxis: Vec3;
  /** Full span vector across the rows. */
  vAxis: Vec3;
  /** Outward face normal (unit). */
  normal: Vec3;
  cols: number;
  rows: number;
}

const C = CELL_SIZE;
const H = CELL_HEIGHT;

export function tileCount(type: PieceType): number {
  return type === "wall" ? 9 : 4;
}

export function gridDims(type: PieceType): { cols: number; rows: number } {
  return type === "wall" ? { cols: 3, rows: 3 } : { cols: 2, rows: 2 };
}

/** The face frame a piece's selection grid is drawn on, in world space. */
export function faceFrame(slot: Slot): FaceFrame {
  if (slot.kind === "wall") {
    const cols = 3;
    const rows = 3;
    if (slot.axis === "z") {
      // Vertical panel spanning X, on the Z grid line.
      return {
        origin: { x: slot.span * C, y: slot.cy * H, z: slot.line * C },
        uAxis: { x: C, y: 0, z: 0 },
        vAxis: { x: 0, y: H, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        cols,
        rows,
      };
    }
    // Vertical panel spanning Z, on the X grid line.
    return {
      origin: { x: slot.line * C, y: slot.cy * H, z: slot.span * C },
      uAxis: { x: 0, y: 0, z: C },
      vAxis: { x: 0, y: H, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      cols,
      rows,
    };
  }
  // Floor / stairs / roof: a horizontal 2x2 grid over the cell footprint. Floors
  // sit on the deck; stairs and roofs float at mid-height so the crosshair can
  // sweep them (drag toward an edge re-faces stairs in T14).
  const yTop = slot.kind === "floor" ? slot.cy * H + 0.31 : slot.cy * H + H / 2;
  return {
    origin: { x: slot.cx * C, y: yTop, z: slot.cz * C },
    uAxis: { x: C, y: 0, z: 0 },
    vAxis: { x: 0, y: 0, z: C },
    normal: { x: 0, y: 1, z: 0 },
    cols: 2,
    rows: 2,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Row-major tile index (row*cols + col) from column/row, or -1 if off-grid. */
export function tileIndex(frame: FaceFrame, col: number, row: number): number {
  if (col < 0 || col >= frame.cols || row < 0 || row >= frame.rows) return -1;
  return row * frame.cols + col;
}

export function tileColRow(frame: FaceFrame, index: number): { col: number; row: number } {
  return { col: index % frame.cols, row: Math.floor(index / frame.cols) };
}

/**
 * The tile a world point projects onto within the frame, or -1 when outside the
 * grid rectangle. u runs along the columns, v along the rows.
 */
export function tileAtPoint(frame: FaceFrame, p: Vec3): number {
  const rel = sub(p, frame.origin);
  const uLen2 = dot(frame.uAxis, frame.uAxis);
  const vLen2 = dot(frame.vAxis, frame.vAxis);
  const a = dot(rel, frame.uAxis) / uLen2; // 0..1 across columns
  const b = dot(rel, frame.vAxis) / vLen2; // 0..1 across rows
  if (a < 0 || a >= 1 || b < 0 || b >= 1) return -1;
  const col = Math.floor(a * frame.cols);
  const row = Math.floor(b * frame.rows);
  return tileIndex(frame, col, row);
}

/**
 * Intersect a ray with the frame plane and return the tile hit (-1 if the ray
 * is parallel, hits behind the origin, or lands off the grid).
 */
export function rayTile(frame: FaceFrame, origin: Vec3, dir: Vec3): number {
  const denom = dot(dir, frame.normal);
  if (Math.abs(denom) < 1e-6) return -1;
  const t = dot(sub(frame.origin, origin), frame.normal) / denom;
  if (t < 0) return -1;
  const p = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
  return tileAtPoint(frame, p);
}

/** World-space center of a tile (for placing overlay quads). */
export function tileCenter(frame: FaceFrame, index: number): Vec3 {
  const { col, row } = tileColRow(frame, index);
  const a = (col + 0.5) / frame.cols;
  const b = (row + 0.5) / frame.rows;
  return {
    x: frame.origin.x + frame.uAxis.x * a + frame.vAxis.x * b,
    y: frame.origin.y + frame.uAxis.y * a + frame.vAxis.y * b,
    z: frame.origin.z + frame.uAxis.z * a + frame.vAxis.z * b,
  };
}
