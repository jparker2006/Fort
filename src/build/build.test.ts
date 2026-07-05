import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CollisionWorld } from "../player/collision.ts";
import {
  slotKey,
  decodeSlotKey,
  wallOnEdge,
  floorSlot,
  stairsSlot,
  roofSlot,
  wallSlot,
} from "./slots.ts";
import { pieceColliders, STAIR_STEPS } from "./colliders.ts";
import { checkPlacement, BUILD_MAX_LEVEL } from "./rules.ts";
import { PoolRegistry, BuildModel, fullVariant } from "./build-model.ts";
import { baseGeometry } from "./variants.ts";
import { PIECE_TYPES, type Slot, type Rotation } from "./piece.ts";

function makeModel(): { model: BuildModel; collision: CollisionWorld; registry: PoolRegistry } {
  const scene = new THREE.Scene();
  const registry = new PoolRegistry(scene);
  for (const type of PIECE_TYPES) {
    registry.registerVariant(fullVariant(type), () => baseGeometry(type));
  }
  const collision = new CollisionWorld();
  const model = new BuildModel(registry, collision);
  return { model, collision, registry };
}

// A set-backed occupancy predicate for the pure rule tests.
function occupancy(slots: Slot[]): (key: string) => boolean {
  const set = new Set(slots.map(slotKey));
  return (k) => set.has(k);
}

describe("slot addressing", () => {
  it("round-trips every slot type and rotation through its key", () => {
    const slots: Slot[] = [
      wallSlot("x", 3, -2, 1),
      wallSlot("z", -5, 4, 0),
      floorSlot(2, 3, -4),
      stairsSlot(-1, 0, 7),
      roofSlot(6, 2, 6),
    ];
    for (const slot of slots) {
      expect(decodeSlotKey(slotKey(slot))).toEqual(slot);
    }
  });

  it("canonicalizes a shared wall edge to one key", () => {
    // The east edge of cell (2,z) is the west edge of cell (3,z): same slot.
    const east = wallOnEdge(2, 0, 5, "E");
    const west = wallOnEdge(3, 0, 5, "W");
    expect(slotKey(east)).toBe(slotKey(west));
    // North edge of (x,4) equals south edge of (x,5).
    const north = wallOnEdge(1, 0, 4, "N");
    const south = wallOnEdge(1, 0, 5, "S");
    expect(slotKey(north)).toBe(slotKey(south));
  });
});

describe("collider derivation", () => {
  it("emits the expected collider count per piece type", () => {
    expect(pieceColliders(wallSlot("z", 0, 0, 0), 0)).toHaveLength(1);
    expect(pieceColliders(floorSlot(0, 0, 0), 0)).toHaveLength(1);
    expect(pieceColliders(stairsSlot(0, 0, 0), 0)).toHaveLength(STAIR_STEPS);
    expect(pieceColliders(roofSlot(0, 0, 0), 0)).toHaveLength(3);
  });

  it("re-faces stair colliders with rotation", () => {
    const north = pieceColliders(stairsSlot(0, 0, 0), 0); // ascends +Z
    const east = pieceColliders(stairsSlot(0, 0, 0), 1); // ascends +X
    // The tallest step of the +Z ramp is at max Z; for the +X ramp it is at max X.
    const tallestZ = north.reduce((a, b) => (b.maxY > a.maxY ? b : a));
    const tallestX = east.reduce((a, b) => (b.maxY > a.maxY ? b : a));
    expect(tallestZ.maxZ).toBeGreaterThan(tallestZ.minZ);
    expect(tallestX.maxX).toBeGreaterThan(tallestX.minX);
    expect(tallestX.maxX).toBeCloseTo(4, 5); // reaches the far X edge of the cell
  });
});

describe("placement rules", () => {
  it("rejects a second piece in an occupied slot", () => {
    const occ = occupancy([floorSlot(0, 0, 0)]);
    expect(checkPlacement(floorSlot(0, 0, 0), occ).reason).toBe("occupied");
  });

  it("accepts a ground-level piece anywhere (ground support)", () => {
    const occ = occupancy([]);
    expect(checkPlacement(floorSlot(3, 0, -2), occ).ok).toBe(true);
    expect(checkPlacement(wallOnEdge(3, 0, -2, "N"), occ).ok).toBe(true);
  });

  it("rejects a floor in midair with no adjacent support", () => {
    const occ = occupancy([]);
    expect(checkPlacement(floorSlot(0, 1, 0), occ).reason).toBe("unsupported");
  });

  it("accepts a floor resting on the top edge of a wall below", () => {
    // A wall at cy=0 on the floor's west edge: its top (y=3) meets the floor base.
    const wall = wallOnEdge(0, 0, 0, "W");
    const occ = occupancy([wall]);
    expect(checkPlacement(floorSlot(0, 1, 0), occ).ok).toBe(true);
  });

  it("rejects placement above the build height limit", () => {
    const occ = occupancy([]);
    expect(checkPlacement(floorSlot(0, BUILD_MAX_LEVEL + 1, 0), occ).reason).toBe("out-of-bounds");
  });

  it("rejects placement outside the island cell bounds", () => {
    const occ = occupancy([]);
    expect(checkPlacement(floorSlot(999, 0, 0), occ).reason).toBe("out-of-bounds");
  });
});

describe("build model derived views", () => {
  it("adds colliders incrementally on place and frees them on remove", () => {
    const { model, collision } = makeModel();
    expect(collision.count).toBe(0);

    model.place(floorSlot(0, 0, 0)); // 1 collider
    expect(collision.count).toBe(1);

    model.place(stairsSlot(1, 0, 0)); // STAIR_STEPS colliders
    expect(collision.count).toBe(1 + STAIR_STEPS);

    model.removeAt(floorSlot(0, 0, 0));
    expect(collision.count).toBe(STAIR_STEPS); // only the stairs remain
  });

  it("uses one pool per (variant, material) and packs instances on remove", () => {
    const { model, registry } = makeModel();
    // Three wood floors -> a single pool.
    model.place(floorSlot(0, 0, 0), { material: "wood" });
    model.place(floorSlot(1, 0, 0), { material: "wood" });
    model.place(floorSlot(2, 0, 0), { material: "wood" });
    expect(registry.poolCount).toBe(1);

    // A stone wall -> a second pool (distinct variant and material).
    model.place(wallOnEdge(0, 0, 0, "N"), { material: "stone" });
    expect(registry.poolCount).toBe(2);

    // Remove the first floor (instance 0); the last floor swaps into its slot.
    // If bookkeeping is correct, removing the remaining floors still succeeds.
    expect(model.removeAt(floorSlot(0, 0, 0))).toBe(true);
    expect(model.removeAt(floorSlot(2, 0, 0))).toBe(true);
    expect(model.removeAt(floorSlot(1, 0, 0))).toBe(true);
    expect(model.count).toBe(1); // only the wall is left
  });

  it("rejects a piece that would intersect the player capsule", () => {
    const { model } = makeModel();
    // Player AABB straddling cell (0,0) at ground level.
    const playerBox = { minX: 1, minY: 0, minZ: 1, maxX: 3, maxY: 1.8, maxZ: 3 };
    const res = model.canPlace(floorSlot(0, 0, 0), { playerBox });
    expect(res.ok).toBe(false);
  });

  it("scatters many valid pieces across a bounded pool set", () => {
    const { model, registry } = makeModel();
    // Place a spread of ground pieces directly (all ground-supported).
    let placed = 0;
    for (let cx = -5; cx <= 5; cx++) {
      for (let cz = -5; cz <= 5; cz++) {
        const kinds: Slot[] = [
          floorSlot(cx, 0, cz),
          wallOnEdge(cx, 0, cz, "W"),
        ];
        for (const slot of kinds) {
          if (model.place(slot, { material: "metal", rotation: 0 as Rotation })) placed++;
        }
      }
    }
    expect(placed).toBeGreaterThan(100);
    // floor+wall, one material -> at most 2 pools (draw calls).
    expect(registry.poolCount).toBeLessThanOrEqual(2);
  });
});
