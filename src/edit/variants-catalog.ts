// The edit variant catalog: the canonical mapping between selection-grid tile
// sets and piece shapes, with geometry and colliders generated from the same
// occupancy data so collision always matches the visual. Walls and floors are
// tile-occupancy masks (each remaining tile is a sub-box); stairs re-face by
// rotation (drag toward an edge) with a half-width variant; roofs use a sloped
// wedge for half and corner cuts.
//
// Variant id scheme: full pieces keep their type id ("wall"..) so they share
// the base pool; edit variants use "type#..." ids resolved lazily.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import { makeBox, type Box } from "../player/collision.ts";
import { WALL_THICK, FLOOR_THICK, STAIR_STEPS, pieceColliders } from "../build/colliders.ts";
import { slotPlacement } from "../build/slots.ts";
import type { PieceType, Rotation, Slot } from "../build/piece.ts";

const C = CELL_SIZE;
const H = CELL_HEIGHT;

const FULL_WALL = 0x1ff; // 9 tiles
const FULL_FLOOR = 0xf; // 4 tiles

export interface VariantChoice {
  variant: string;
  /** New facing for stairs/roof re-facing; undefined keeps the current one. */
  rotation?: Rotation;
}

// --- Selection -> variant ------------------------------------------------

function maskOf(selection: Set<number>): number {
  let m = 0;
  for (const i of selection) m |= 1 << i;
  return m;
}

/** Edge tile sets for the 2x2 stair/roof grid (col along +X, row along +Z). */
const EDGES: Record<string, { tiles: number; rotation: Rotation }> = {
  south: { tiles: (1 << 0) | (1 << 1), rotation: 2 }, // row 0 (min Z)
  north: { tiles: (1 << 2) | (1 << 3), rotation: 0 }, // row 1 (max Z)
  west: { tiles: (1 << 0) | (1 << 2), rotation: 3 }, // col 0 (min X)
  east: { tiles: (1 << 1) | (1 << 3), rotation: 1 }, // col 1 (max X)
};

export function selectionToVariant(type: PieceType, selection: Set<number>): VariantChoice | null {
  const m = maskOf(selection);
  if (type === "wall") {
    const solid = FULL_WALL & ~m;
    if (solid === FULL_WALL) return { variant: "wall" };
    if (solid === 0) return null; // nothing left to place
    return { variant: `wall#${solid}` };
  }
  if (type === "floor") {
    const solid = FULL_FLOOR & ~m;
    if (solid === FULL_FLOOR) return { variant: "floor" };
    if (solid === 0) return null;
    return { variant: `floor#${solid}` };
  }
  if (type === "stairs") {
    if (m === 0) return { variant: "stairs" };
    for (const e of Object.values(EDGES)) if (m === e.tiles) return { variant: "stairs", rotation: e.rotation };
    if (selection.size === 1) return { variant: "stairs#w", rotation: cornerRotation(selection) };
    return null;
  }
  // roof
  if (m === 0) return { variant: "roof" };
  for (const e of Object.values(EDGES)) if (m === e.tiles) return { variant: "roof#h", rotation: e.rotation };
  if (selection.size === 1) return { variant: "roof#c", rotation: cornerRotation(selection) };
  return null;
}

// A single selected 2x2 tile maps to the rotation that faces its corner.
function cornerRotation(selection: Set<number>): Rotation {
  const t = [...selection][0] ?? 0;
  // tiles: 0=(-X,-Z) 1=(+X,-Z) 2=(-X,+Z) 3=(+X,+Z)
  const map: Record<number, Rotation> = { 0: 3, 1: 1, 2: 0, 3: 1 };
  return map[t] ?? 0;
}

/** Tiles pre-selected to represent a variant (baseline for reset / re-edit). */
export function variantToSelection(type: PieceType, variantId: string): Set<number> {
  const parsed = parseVariant(variantId);
  const sel = new Set<number>();
  if (parsed.kind === "wallMask") {
    for (let i = 0; i < 9; i++) if (!(parsed.mask & (1 << i))) sel.add(i);
  } else if (parsed.kind === "floorMask") {
    for (let i = 0; i < 4; i++) if (!(parsed.mask & (1 << i))) sel.add(i);
  }
  void type;
  return sel; // stairs/roof edits start from an empty baseline
}

// --- Variant id parsing --------------------------------------------------

type Parsed =
  | { kind: "base"; type: PieceType }
  | { kind: "wallMask"; mask: number }
  | { kind: "floorMask"; mask: number }
  | { kind: "stairsNarrow" }
  | { kind: "roofHalf" }
  | { kind: "roofCorner" };

function parseVariant(id: string): Parsed {
  const hash = id.indexOf("#");
  if (hash < 0) return { kind: "base", type: id as PieceType };
  const type = id.slice(0, hash);
  const rest = id.slice(hash + 1);
  if (type === "wall") return { kind: "wallMask", mask: Number(rest) };
  if (type === "floor") return { kind: "floorMask", mask: Number(rest) };
  if (type === "stairs") return { kind: "stairsNarrow" };
  if (rest === "h") return { kind: "roofHalf" };
  return { kind: "roofCorner" };
}

// --- Geometry ------------------------------------------------------------

/** Geometry for an edit variant id, or null for a base piece (which uses its
 * pre-registered base geometry pool). */
export function variantGeometry(id: string): THREE.BufferGeometry | null {
  const p = parseVariant(id);
  switch (p.kind) {
    case "base":
      return null;
    case "wallMask":
      return wallMaskGeometry(p.mask);
    case "floorMask":
      return floorMaskGeometry(p.mask);
    case "stairsNarrow":
      return rampGeometry(C / 2);
    case "roofHalf":
      return wedgeGeometry(C);
    case "roofCorner":
      return wedgeGeometry(C / 2);
  }
}

function wallMaskGeometry(mask: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tw = C / 3;
  const th = H / 3;
  for (let i = 0; i < 9; i++) {
    if (!(mask & (1 << i))) continue;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const g = new THREE.BoxGeometry(tw, th, WALL_THICK);
    g.translate(-C / 2 + (col + 0.5) * tw, (row + 0.5) * th, 0);
    parts.push(g);
  }
  return mergeParts(parts);
}

function floorMaskGeometry(mask: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const q = C / 2;
  for (let i = 0; i < 4; i++) {
    if (!(mask & (1 << i))) continue;
    const qx = i % 2;
    const qz = Math.floor(i / 2);
    const g = new THREE.BoxGeometry(q, FLOOR_THICK, q);
    g.translate(-C / 2 + (qx + 0.5) * q, FLOOR_THICK / 2, -C / 2 + (qz + 0.5) * q);
    parts.push(g);
  }
  return mergeParts(parts);
}

// A stepped ramp mesh of the given width, ascending +Z (rot 0), matching the
// stair collider steps so a half-width stair reads and collides the same.
function rampGeometry(width: number): THREE.BufferGeometry {
  const n = STAIR_STEPS;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) / n) * H;
    const depth = C / n;
    const g = new THREE.BoxGeometry(width, top, depth);
    g.translate(0, top / 2, -C / 2 + (i + 0.5) * depth);
    parts.push(g);
  }
  return mergeParts(parts);
}

// A smooth triangular-prism wedge of the given width, sloping up toward +Z.
function wedgeGeometry(width: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hc = C / 2;
  // Cross-section triangle in Y-Z: (z=-hc,y=0)-(z=hc,y=0)-(z=hc,y=H).
  const v = [
    -hw, 0, -hc, // 0 L0
    -hw, 0, hc, // 1 L1
    -hw, H, hc, // 2 L2
    hw, 0, -hc, // 3 R0
    hw, 0, hc, // 4 R1
    hw, H, hc, // 5 R2
  ];
  const idx = [
    0, 1, 2, // left face
    3, 5, 4, // right face
    0, 3, 4, 0, 4, 1, // bottom
    0, 2, 5, 0, 5, 3, // slope
    1, 4, 5, 1, 5, 2, // back (+Z)
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// --- Colliders (world space) --------------------------------------------

/** Colliders for a placed variant, or the base-piece colliders for base ids. */
export function variantColliders(slot: Slot, rotation: Rotation, id: string): Box[] {
  const p = parseVariant(id);
  switch (p.kind) {
    case "base":
      return pieceColliders(slot, rotation);
    case "wallMask":
      return wallMaskColliders(slot, p.mask);
    case "floorMask":
      return floorMaskColliders(slot, p.mask);
    case "stairsNarrow":
      return rampColliders(slot, rotation, C / 2);
    case "roofHalf":
      return rampColliders(slot, rotation, C);
    case "roofCorner":
      return rampColliders(slot, rotation, C / 2);
  }
}

function wallMaskColliders(slot: Slot, mask: number): Box[] {
  const p = slotPlacement(slot, 0);
  const axisZ = slot.kind === "wall" && slot.axis === "z";
  const tw = C / 3;
  const th = H / 3;
  const boxes: Box[] = [];
  for (let i = 0; i < 9; i++) {
    if (!(mask & (1 << i))) continue;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const y = p.y + (row + 0.5) * th;
    if (axisZ) {
      boxes.push(makeBox(p.x - C / 2 + (col + 0.5) * tw, y, p.z, tw, th, WALL_THICK));
    } else {
      boxes.push(makeBox(p.x, y, p.z - C / 2 + (col + 0.5) * tw, WALL_THICK, th, tw));
    }
  }
  return boxes;
}

function floorMaskColliders(slot: Slot, mask: number): Box[] {
  const p = slotPlacement(slot, 0);
  const q = C / 2;
  const boxes: Box[] = [];
  for (let i = 0; i < 4; i++) {
    if (!(mask & (1 << i))) continue;
    const qx = i % 2;
    const qz = Math.floor(i / 2);
    boxes.push(
      makeBox(
        p.x - C / 2 + (qx + 0.5) * q,
        p.y + FLOOR_THICK / 2,
        p.z - C / 2 + (qz + 0.5) * q,
        q,
        FLOOR_THICK,
        q,
      ),
    );
  }
  return boxes;
}

// Stepped ramp colliders of the given width, in world space, re-faced by
// rotation. Rotation 0 ascends +Z; 1 +X; 2 -Z; 3 -X.
function rampColliders(slot: Slot, rotation: Rotation, width: number): Box[] {
  if (slot.kind === "wall") return [];
  const ox = slot.cx * C;
  const oz = slot.cz * C;
  const oy = slot.cy * H;
  const n = STAIR_STEPS;
  const inset = (C - width) / 2;
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) / n) * H;
    const lo = (i / n) * C;
    const hi = ((i + 1) / n) * C;
    let minX: number, maxX: number, minZ: number, maxZ: number;
    switch (rotation) {
      case 0:
        minX = ox + inset; maxX = ox + C - inset; minZ = oz + lo; maxZ = oz + hi; break;
      case 1:
        minX = ox + lo; maxX = ox + hi; minZ = oz + inset; maxZ = oz + C - inset; break;
      case 2:
        minX = ox + inset; maxX = ox + C - inset; minZ = oz + C - hi; maxZ = oz + C - lo; break;
      case 3:
        minX = ox + C - hi; maxX = ox + C - lo; minZ = oz + inset; maxZ = oz + C - inset; break;
    }
    boxes.push(
      makeBox((minX + maxX) / 2, oy + top / 2, (minZ + maxZ) / 2, maxX - minX, top, maxZ - minZ),
    );
  }
  return boxes;
}
