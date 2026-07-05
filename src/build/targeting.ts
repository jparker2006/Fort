// Fortnite-style build targeting: turn the crosshair aim ray into the slot the
// selected piece would occupy. Pure math over the grid constants and a supplied
// player position, so the ray-to-slot mapping is table-testable without THREE.
//
// The flow mirrors Fortnite's ground-projected build: the player builds at the
// storey their feet are on; the aim ray is projected onto that storey's plane
// (or clamped to a fixed reach when it points past it); the aimed cell then
// resolves per piece type (walls snap to the nearest cell edge, floors to the
// cell, ramps face away from the player, cones to the cell top).

import { CELL_SIZE, CELL_HEIGHT, worldToCell, cellInBounds, CELL_MIN, CELL_MAX } from "../world/grid.ts";
import type { PieceType, Rotation, Slot } from "./piece.ts";
import { floorSlot, stairsSlot, roofSlot, wallOnEdge, type WallDir } from "./slots.ts";
import { BUILD_MAX_LEVEL } from "./rules.ts";

/** How far in front of the player a piece can be targeted, in world units. */
export const BUILD_REACH = 3 * CELL_SIZE;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TargetContext {
  origin: Vec3;
  dir: Vec3;
  playerX: number;
  playerZ: number;
  playerFeetY: number;
  type: PieceType;
  /** Quarter-turns from the rotate bind, added to the auto facing. */
  rotationOffset: Rotation;
}

export interface Target {
  slot: Slot;
  rotation: Rotation;
}

/** The storey a player standing at `feetY` builds on. */
export function buildLevel(feetY: number): number {
  // The + 0.5 is an absolute snap tolerance (half a metre of foot slack), not a
  // grid-derived length, so it stays 0.5 at any CELL_HEIGHT and is not rescaled.
  return Math.max(0, Math.min(BUILD_MAX_LEVEL, Math.floor((feetY + 0.5) / CELL_HEIGHT)));
}

export function resolveTarget(ctx: TargetContext): Target {
  const cy = buildLevel(ctx.playerFeetY);
  const planeY = cy * CELL_HEIGHT;
  const { hitX, hitZ } = projectToPlane(ctx, planeY);

  // Clamp to the island so the ghost never leaves the buildable area.
  const cell = worldToCell(hitX, hitZ);
  const cx = clampCell(cell.cx);
  const cz = clampCell(cell.cz);

  switch (ctx.type) {
    case "floor":
      return { slot: floorSlot(cx, cy, cz), rotation: 0 };
    case "wall":
      return { slot: nearestEdgeWall(cx, cy, cz, hitX, hitZ), rotation: 0 };
    case "stairs": {
      const rot = ((autoFace(ctx.playerX, ctx.playerZ, cx, cz) + ctx.rotationOffset) % 4) as Rotation;
      return { slot: stairsSlot(cx, cy, cz), rotation: rot };
    }
    case "roof":
      return { slot: roofSlot(cx, cy, cz), rotation: ctx.rotationOffset };
  }
}

// Intersect the aim ray with the horizontal build plane; if it does not cross
// the plane within reach, project a point at BUILD_REACH along the ray's
// horizontal heading from the player instead. The result is always clamped to
// within BUILD_REACH of the player.
function projectToPlane(ctx: TargetContext, planeY: number): { hitX: number; hitZ: number } {
  const { origin, dir } = ctx;
  let hitX: number;
  let hitZ: number;
  const t = Math.abs(dir.y) > 1e-4 ? (planeY - origin.y) / dir.y : -1;
  if (t > 0) {
    hitX = origin.x + dir.x * t;
    hitZ = origin.z + dir.z * t;
  } else {
    const h = Math.hypot(dir.x, dir.z) || 1;
    hitX = ctx.playerX + (dir.x / h) * BUILD_REACH;
    hitZ = ctx.playerZ + (dir.z / h) * BUILD_REACH;
  }

  const dx = hitX - ctx.playerX;
  const dz = hitZ - ctx.playerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > BUILD_REACH && dist > 0) {
    const k = BUILD_REACH / dist;
    hitX = ctx.playerX + dx * k;
    hitZ = ctx.playerZ + dz * k;
  }
  return { hitX, hitZ };
}

// The wall on the cell edge nearest the aim point (Fortnite snaps the wall to
// the edge you are looking at).
function nearestEdgeWall(cx: number, cy: number, cz: number, hitX: number, hitZ: number): Slot {
  const ox = cx * CELL_SIZE;
  const oz = cz * CELL_SIZE;
  const dW = Math.abs(hitX - ox);
  const dE = Math.abs(hitX - (ox + CELL_SIZE));
  const dS = Math.abs(hitZ - oz);
  const dN = Math.abs(hitZ - (oz + CELL_SIZE));
  let dir: WallDir = "W";
  let best = dW;
  if (dE < best) {
    best = dE;
    dir = "E";
  }
  if (dS < best) {
    best = dS;
    dir = "S";
  }
  if (dN < best) {
    dir = "N";
  }
  return wallOnEdge(cx, cy, cz, dir);
}

// The ramp facing that ascends away from the player (low edge nearest them).
function autoFace(px: number, pz: number, cx: number, cz: number): Rotation {
  const dx = (cx + 0.5) * CELL_SIZE - px;
  const dz = (cz + 0.5) * CELL_SIZE - pz;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 1 : 3;
  return dz >= 0 ? 0 : 2;
}

function clampCell(c: number): number {
  return Math.max(CELL_MIN, Math.min(CELL_MAX, c));
}

/** True when a resolved cell target is inside the island (targeting never
 * returns out-of-island cells, but callers may want to know it was clamped). */
export function targetInBounds(target: Target): boolean {
  const s = target.slot;
  if (s.kind === "wall") return true;
  return cellInBounds(s.cx, s.cz);
}
