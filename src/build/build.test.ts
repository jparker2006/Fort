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
import { pieceColliders, STAIR_STEPS, ROOF_LAYERS } from "./colliders.ts";
import { checkPlacement, BUILD_MAX_LEVEL } from "./rules.ts";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import { MOVE } from "../player/movement-tuning.ts";
import { PoolRegistry, BuildModel, fullVariant, REPLACE_COOLDOWN } from "./build-model.ts";
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
    expect(pieceColliders(roofSlot(0, 0, 0), 0)).toHaveLength(ROOF_LAYERS);
  });

  it("re-faces stair colliders with rotation", () => {
    const north = pieceColliders(stairsSlot(0, 0, 0), 0); // ascends +Z
    const east = pieceColliders(stairsSlot(0, 0, 0), 1); // ascends +X
    // The tallest step of the +Z ramp is at max Z; for the +X ramp it is at max X.
    const tallestZ = north.reduce((a, b) => (b.maxY > a.maxY ? b : a));
    const tallestX = east.reduce((a, b) => (b.maxY > a.maxY ? b : a));
    expect(tallestZ.maxZ).toBeGreaterThan(tallestZ.minZ);
    expect(tallestX.maxX).toBeGreaterThan(tallestX.minX);
    expect(tallestX.maxX).toBeCloseTo(CELL_SIZE, 5); // reaches the far X edge of the cell
  });

  it("stair treads stay a margin under the player step-up height", () => {
    // With the T23 rescale the cell is 3.6 tall; STAIR_STEPS (7) keeps each tread
    // rise = CELL_HEIGHT / STAIR_STEPS = 0.514, safely under MOVE.stepHeight (0.6)
    // with the required 0.05 margin. At six steps the tread would be 0.6, exactly
    // on the boundary, so the player could snag climbing a ramp.
    const boxes = pieceColliders(stairsSlot(0, 0, 0), 0);
    const tops = boxes.map((b) => b.maxY).sort((a, b) => a - b);
    let maxRise = tops[0]!; // ground (y=0) up to the first tread
    for (let i = 1; i < tops.length; i++) maxRise = Math.max(maxRise, tops[i]! - tops[i - 1]!);
    expect(maxRise).toBeCloseTo(CELL_HEIGHT / STAIR_STEPS, 5);
    expect(maxRise).toBeLessThan(MOVE.stepHeight - 0.05);
  });

  it("roof colliders peak at half a wall and rise a margin under step height", () => {
    // T24: the cone caps at CELL_HEIGHT / 2 (half a wall). Four layers keep each
    // rise = (CELL_HEIGHT / 2) / ROOF_LAYERS = 0.45, under MOVE.stepHeight (0.6);
    // three layers would land the rise exactly on the 0.6 boundary.
    const boxes = pieceColliders(roofSlot(0, 0, 0), 0);
    const tops = boxes.map((b) => b.maxY).sort((a, b) => a - b);
    expect(tops[tops.length - 1]!).toBeCloseTo(CELL_HEIGHT / 2, 5); // apex height
    let maxRise = tops[0]!; // cell base up to the first layer
    for (let i = 1; i < tops.length; i++) maxRise = Math.max(maxRise, tops[i]! - tops[i - 1]!);
    expect(maxRise).toBeCloseTo(CELL_HEIGHT / 2 / ROOF_LAYERS, 5);
    expect(maxRise).toBeLessThan(MOVE.stepHeight - 0.05);
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

  it("locks a just-freed slot against an instant rebuild, then reopens it (T25)", () => {
    const { model } = makeModel();
    const slot = floorSlot(0, 0, 0);
    expect(model.place(slot)).toBe(true);
    expect(model.removeAt(slot)).toBe(true);

    // Right after the removal seam the same slot is cooling: canPlace reports it
    // and place() refuses, even though the slot is empty and ground-supported.
    expect(model.canPlace(slot)).toEqual({ ok: false, reason: "cooling" });
    expect(model.place(slot)).toBe(false);

    // Advancing the model clock past the window reopens the slot exactly.
    model.tick(REPLACE_COOLDOWN);
    expect(model.canPlace(slot).ok).toBe(true);
    expect(model.place(slot)).toBe(true);
  });

  it("cools only the freed slot, never a neighbour (negative space, T25)", () => {
    const { model } = makeModel();
    model.place(floorSlot(0, 0, 0));
    model.removeAt(floorSlot(0, 0, 0));
    // A different slot is placeable at t+0 after the destroy.
    expect(model.canPlace(floorSlot(1, 0, 0)).ok).toBe(true);
    expect(model.place(floorSlot(1, 0, 0))).toBe(true);
  });

  it("arms the cooldown on every removal path, including damage destroy (T25 seam)", () => {
    const { model } = makeModel();
    const slot = wallOnEdge(0, 0, 0, "S");
    model.place(slot, { material: "wood" }); // 2 HP
    // damageAt routes through removeAt when it destroys, so the seam still arms.
    expect(model.damageAt(slot, 2)).toBe("destroyed");
    expect(model.canPlace(slot).reason).toBe("cooling");
  });

  it("purges expired entries on every insert, staying bounded (T25)", () => {
    const { model } = makeModel();
    // Three removals inside one window are all held at once.
    for (const cx of [0, 1, 2]) {
      model.place(floorSlot(cx, 0, 0));
      model.removeAt(floorSlot(cx, 0, 0));
    }
    expect(model.cooldownCount).toBe(3);

    // Advance past the window; the next removal purges all three expired entries
    // before inserting its own, so the map never grows unbounded.
    model.tick(REPLACE_COOLDOWN + 0.01);
    model.place(floorSlot(5, 0, 0));
    model.removeAt(floorSlot(5, 0, 0));
    expect(model.cooldownCount).toBe(1);
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

describe("material HP maturation (T30)", () => {
  it("places at half HP and matures +1 per second up to each material's full HP", () => {
    const { model } = makeModel();
    const wood = floorSlot(0, 0, 0);
    const stone = floorSlot(1, 0, 0);
    const metal = floorSlot(2, 0, 0);
    model.place(wood, { material: "wood" });
    model.place(stone, { material: "stone" });
    model.place(metal, { material: "metal" });

    // Spawn at ceil(full / 2): wood 1, stone 2, metal 3.
    expect(model.hpAt(wood)).toBe(1);
    expect(model.hpAt(stone)).toBe(2);
    expect(model.hpAt(metal)).toBe(3);

    model.tick(1);
    expect(model.hpAt(wood)).toBe(2); // full at 2, stops
    expect(model.hpAt(stone)).toBe(3);
    expect(model.hpAt(metal)).toBe(4);

    model.tick(1);
    expect(model.hpAt(stone)).toBe(4); // full at 4
    expect(model.hpAt(metal)).toBe(5);

    model.tick(1);
    expect(model.hpAt(metal)).toBe(6); // full at 6

    model.tick(5); // long past full: nothing over-matures
    expect(model.hpAt(wood)).toBe(2);
    expect(model.hpAt(stone)).toBe(4);
    expect(model.hpAt(metal)).toBe(6);
    expect(model.maturingCount).toBe(0); // schedule fully drained
  });

  it("a big tick that spans several steps still stops exactly at full", () => {
    const { model } = makeModel();
    const metal = floorSlot(0, 0, 0);
    model.place(metal, { material: "metal" });
    model.tick(10); // one huge step covering all maturation at once
    expect(model.hpAt(metal)).toBe(6);
  });

  it("destroying a maturing piece clears its schedule (no resurrection)", () => {
    const { model } = makeModel();
    const slot = floorSlot(0, 0, 0);
    model.place(slot, { material: "metal" }); // will mature 3 -> 6
    expect(model.maturingCount).toBe(1);

    model.removeAt(slot);
    expect(model.count).toBe(0);

    model.tick(5); // well past when it would have matured
    expect(model.count).toBe(0);
    expect(model.has(slot)).toBe(false);
    expect(model.maturingCount).toBe(0); // stale event popped and discarded
  });

  it("a re-placed slot matures on its own clock, ignoring the old stale event", () => {
    const { model } = makeModel();
    const slot = floorSlot(0, 0, 0);
    model.place(slot, { material: "stone" }); // event at t=1
    model.removeAt(slot);
    model.tick(0.2); // clear the replace cooldown (0.15); stale event still at t=1

    model.place(slot, { material: "stone" }); // fresh: hp 2, next step at t=1.2
    // Advance past the OLD event (t=1) but not the NEW one (t=1.2): the stale
    // event fires against the fresh piece and is skipped by the matureAt match.
    model.tick(0.85); // now t=1.05
    expect(model.hpAt(slot)).toBe(2);
    // Past the new step: the fresh piece hardens on its own clock.
    model.tick(0.3); // now t=1.35
    expect(model.hpAt(slot)).toBe(3);
  });
});
