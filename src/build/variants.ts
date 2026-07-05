// Render geometry and materials for build pieces. Each geometry is anchored with
// its base at y=0 in a canonical pose (rotation applied per-instance), so the
// instance matrix is just the slot placement. Materials are flat placeholders
// here; T11 replaces them with procedural wood/stone/metal textures.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import { WALL_THICK, FLOOR_THICK, STAIR_STEPS } from "./colliders.ts";
import type { Material, PieceType } from "./piece.ts";

const C = CELL_SIZE;
const H = CELL_HEIGHT;

/** Base geometry for a full (unedited) piece of each type. */
export function baseGeometry(type: PieceType): THREE.BufferGeometry {
  switch (type) {
    case "wall":
      return anchored(new THREE.BoxGeometry(C, H, WALL_THICK), H / 2);
    case "floor":
      return anchored(new THREE.BoxGeometry(C, FLOOR_THICK, C), FLOOR_THICK / 2);
    case "stairs":
      return stairGeometry();
    case "roof":
      return roofGeometry();
  }
}

// A stepped staircase matching the stair colliders (rotation 0, ascending +Z).
function stairGeometry(): THREE.BufferGeometry {
  const n = STAIR_STEPS;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) / n) * H;
    const depth = C / n;
    const g = new THREE.BoxGeometry(C, top, depth);
    // Center: X at cell center, Y half its height, Z at the i-th tread.
    g.translate(0, top / 2, -C / 2 + (i + 0.5) * depth);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// A four-sided pyramid (cone with 4 radial segments) filling the cell.
function roofGeometry(): THREE.BufferGeometry {
  const radius = C * 0.72; // flat-to-flat span reaches the cell edges
  const g = new THREE.ConeGeometry(radius, H, 4);
  g.rotateY(Math.PI / 4); // square base aligned to the cell
  g.translate(0, H / 2, 0);
  return g;
}

function anchored(g: THREE.BufferGeometry, halfHeight: number): THREE.BufferGeometry {
  g.translate(0, halfHeight, 0);
  return g;
}

const MATERIAL_COLOR: Record<Material, number> = {
  wood: 0x9c6b3f,
  stone: 0x8a8f96,
  metal: 0x6f7c8a,
};

/** Placeholder material per material id (T11 swaps in procedural textures). */
export function baseMaterial(material: Material): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: MATERIAL_COLOR[material],
    roughness: material === "metal" ? 0.4 : 0.85,
    metalness: material === "metal" ? 0.6 : 0.05,
  });
}
