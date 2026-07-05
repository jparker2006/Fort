// Derived collider set: the AABB boxes a piece contributes to the movement
// controller's CollisionWorld. Pure geometry over the grid constants; the
// BuildModel adds and removes these incrementally as pieces come and go.

import { makeBox, type Box } from "../player/collision.ts";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import type { Slot, Rotation } from "./piece.ts";
import { slotPlacement } from "./slots.ts";

/** Wall/floor slab thickness in world units (also used by the render geometry). */
export const WALL_THICK = 0.3;
export const FLOOR_THICK = 0.3;

// Steps a full ramp is discretized into for collision (and its stepped mesh).
// Six steps over the 3-unit cell height gives 0.5 per tread, within the player
// step-up height (0.6) so ramps are smoothly walkable.
export const STAIR_STEPS = 6;
/** Stacked boxes approximating a roof/cone so it is walkable (refined in T14). */
const ROOF_LAYERS = 3;

const C = CELL_SIZE;
const H = CELL_HEIGHT;

/** All colliders for a placed piece, in world space. */
export function pieceColliders(slot: Slot, rotation: Rotation): Box[] {
  const p = slotPlacement(slot, rotation);
  switch (slot.kind) {
    case "wall": {
      const [sx, sz] = slot.axis === "z" ? [C, WALL_THICK] : [WALL_THICK, C];
      return [makeBox(p.x, p.y + H / 2, p.z, sx, H, sz)];
    }
    case "floor":
      return [makeBox(p.x, p.y + FLOOR_THICK / 2, p.z, C, FLOOR_THICK, C)];
    case "stairs":
      return stairColliders(slot.cx, slot.cy, slot.cz, rotation);
    case "roof":
      return roofColliders(slot.cx, slot.cy, slot.cz);
  }
}

// A ramp rising across the cell. Rotation 0 ascends toward +Z (low south edge),
// then quarter-turns clockwise: 1 -> +X, 2 -> -Z, 3 -> -X. Each step is a solid
// block from the cell floor up to its tread height, so the capsule step-up walks
// it smoothly.
function stairColliders(cx: number, cy: number, cz: number, rotation: Rotation): Box[] {
  const ox = cx * C;
  const oz = cz * C;
  const oy = cy * H;
  const n = STAIR_STEPS;
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) / n) * H;
    const lo = (i / n) * C;
    const hi = ((i + 1) / n) * C;
    let minX: number, maxX: number, minZ: number, maxZ: number;
    switch (rotation) {
      case 0:
        minX = ox; maxX = ox + C; minZ = oz + lo; maxZ = oz + hi; break;
      case 1:
        minX = ox + lo; maxX = ox + hi; minZ = oz; maxZ = oz + C; break;
      case 2:
        minX = ox; maxX = ox + C; minZ = oz + C - hi; maxZ = oz + C - lo; break;
      case 3:
        minX = ox + C - hi; maxX = ox + C - lo; minZ = oz; maxZ = oz + C; break;
    }
    boxes.push(centerBox(minX, maxX, oy, oy + top, minZ, maxZ));
  }
  return boxes;
}

// A stepped pyramid: concentric shrinking blocks. Symmetric, so rotation does
// not change the collider (corner-cut variants arrive in T14).
function roofColliders(cx: number, cy: number, cz: number): Box[] {
  const cxw = cx * C + C / 2;
  const czw = cz * C + C / 2;
  const oy = cy * H;
  const boxes: Box[] = [];
  for (let k = 0; k < ROOF_LAYERS; k++) {
    const inset = (k / ROOF_LAYERS) * (C * 0.4);
    const size = C - 2 * inset;
    const yLo = oy + (k / ROOF_LAYERS) * H;
    const yHi = oy + ((k + 1) / ROOF_LAYERS) * H;
    boxes.push(makeBox(cxw, (yLo + yHi) / 2, czw, size, yHi - yLo, size));
  }
  return boxes;
}

function centerBox(
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number,
): Box {
  return makeBox(
    (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2,
    maxX - minX, maxY - minY, maxZ - minZ,
  );
}
