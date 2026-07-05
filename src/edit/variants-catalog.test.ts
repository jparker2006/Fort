import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CollisionWorld, boxesOverlap, makeBox } from "../player/collision.ts";
import { PoolRegistry, BuildModel, fullVariant } from "../build/build-model.ts";
import { baseGeometry } from "../build/variants.ts";
import { PIECE_TYPES, type Slot } from "../build/piece.ts";
import { wallOnEdge, floorSlot, stairsSlot } from "../build/slots.ts";
import {
  selectionToVariant,
  variantToSelection,
  variantGeometry,
  variantColliders,
} from "./variants-catalog.ts";

const sel = (...t: number[]) => new Set(t);

describe("selection to variant mapping", () => {
  it("maps canonical wall edits to solid-tile masks", () => {
    expect(selectionToVariant("wall", sel())).toEqual({ variant: "wall" }); // full
    // Window: remove the center tile (4) -> solid mask keeps the other 8.
    expect(selectionToVariant("wall", sel(4))).toEqual({ variant: `wall#${0x1ff & ~(1 << 4)}` });
    // Door: remove the bottom-center column (tiles 1 and 4).
    expect(selectionToVariant("wall", sel(1, 4))).toEqual({
      variant: `wall#${0x1ff & ~((1 << 1) | (1 << 4))}`,
    });
    // Low wall: remove the top two rows (tiles 3..8) -> only bottom row (0,1,2).
    expect(selectionToVariant("wall", sel(3, 4, 5, 6, 7, 8))).toEqual({ variant: "wall#7" });
  });

  it("refuses a selection that removes the whole piece", () => {
    expect(selectionToVariant("wall", sel(0, 1, 2, 3, 4, 5, 6, 7, 8))).toBeNull();
    expect(selectionToVariant("floor", sel(0, 1, 2, 3))).toBeNull();
  });

  it("maps floor holes to quarter masks", () => {
    // Remove one corner quarter (tile 0).
    expect(selectionToVariant("floor", sel(0))).toEqual({ variant: `floor#${0xf & ~1}` });
    // Half floor: remove a row of two.
    expect(selectionToVariant("floor", sel(0, 1))).toEqual({ variant: `floor#${0xf & ~0b11}` });
  });

  it("re-faces stairs by the dragged edge", () => {
    expect(selectionToVariant("stairs", sel())).toEqual({ variant: "stairs" });
    expect(selectionToVariant("stairs", sel(2, 3))).toEqual({ variant: "stairs", rotation: 0 }); // north
    expect(selectionToVariant("stairs", sel(0, 1))).toEqual({ variant: "stairs", rotation: 2 }); // south
    expect(selectionToVariant("stairs", sel(0, 2))).toEqual({ variant: "stairs", rotation: 3 }); // west
    expect(selectionToVariant("stairs", sel(1, 3))).toEqual({ variant: "stairs", rotation: 1 }); // east
  });

  it("maps roof edge edits to a half roof facing that edge", () => {
    expect(selectionToVariant("roof", sel())).toEqual({ variant: "roof" });
    expect(selectionToVariant("roof", sel(2, 3))).toEqual({ variant: "roof#h", rotation: 0 });
  });

  it("mirrors symmetrically: a mirrored selection gives the mirrored variant", () => {
    // Horizontal mirror of a 3x3 tile index (col -> 2-col).
    const mirrorTile = (i: number) => Math.floor(i / 3) * 3 + (2 - (i % 3));
    const mirrorSel = (s: Set<number>) => new Set([...s].map(mirrorTile));
    const mirrorMask = (m: number) => {
      let out = 0;
      for (let i = 0; i < 9; i++) if (m & (1 << i)) out |= 1 << mirrorTile(i);
      return out;
    };
    const base = sel(0, 3); // left column, bottom two
    const v = selectionToVariant("wall", base)!;
    const vm = selectionToVariant("wall", mirrorSel(base))!;
    const mask = Number(v.variant.split("#")[1]);
    const maskM = Number(vm.variant.split("#")[1]);
    expect(maskM).toBe(mirrorMask(mask));
  });
});

describe("variant round-trip", () => {
  it("recovers the removed-tile selection from a wall or floor variant", () => {
    const v = selectionToVariant("wall", sel(1, 4))!;
    expect(variantToSelection("wall", v.variant)).toEqual(sel(1, 4));
    const f = selectionToVariant("floor", sel(0))!;
    expect(variantToSelection("floor", f.variant)).toEqual(sel(0));
  });
});

describe("variant geometry and colliders agree", () => {
  it("emits one collider per solid wall tile", () => {
    const slot = wallOnEdge(0, 0, 0, "S");
    expect(variantColliders(slot, 0, "wall#7")).toHaveLength(3); // bottom row
    expect(variantColliders(slot, 0, `wall#${0x1ff & ~(1 << 4)}`)).toHaveLength(8); // window
  });

  it("a low wall's colliders only reach one third of the height", () => {
    const boxes = variantColliders(wallOnEdge(0, 0, 0, "S"), 0, "wall#7");
    const maxY = Math.max(...boxes.map((b) => b.maxY));
    expect(maxY).toBeCloseTo(1, 5); // H/3 = 1
  });

  it("a door leaves the center column open (no collider there)", () => {
    const slot = wallOnEdge(0, 0, 0, "S"); // spans X 0..4 at Z=0
    const door = selectionToVariant("wall", sel(1, 4))!.variant;
    const boxes = variantColliders(slot, 0, door);
    // A probe box at the door opening (center X, low Y) hits nothing.
    const probe = makeBox(2, 0.7, 0, 0.6, 1.2, 0.6);
    expect(boxes.some((b) => boxesOverlap(b, probe))).toBe(false);
  });

  it("a floor corner hole removes exactly that quarter's collider", () => {
    const slot = floorSlot(0, 0, 0); // cell x0..4 z0..4
    const hole = selectionToVariant("floor", sel(0))!.variant; // removes tile 0 (x0..2,z0..2)
    const boxes = variantColliders(slot, 0, hole);
    expect(boxes).toHaveLength(3);
    const probe = makeBox(1, 0.2, 1, 0.5, 0.5, 0.5); // over the removed quarter
    expect(boxes.some((b) => boxesOverlap(b, probe))).toBe(false);
  });

  it("builds non-empty geometry for every variant kind", () => {
    for (const id of ["wall#7", `floor#${0xe}`, "stairs#w", "roof#h", "roof#c"]) {
      const g = variantGeometry(id)!;
      expect(g, id).toBeTruthy();
      expect(g.getAttribute("position").count, id).toBeGreaterThan(0);
    }
    expect(variantGeometry("wall")).toBeNull(); // base uses its own pool
  });
});

describe("applyEdit swaps the derived views and reset restores them", () => {
  function makeModel(): { model: BuildModel; collision: CollisionWorld } {
    const scene = new THREE.Scene();
    const registry = new PoolRegistry(scene);
    for (const type of PIECE_TYPES) registry.registerVariant(fullVariant(type), () => baseGeometry(type));
    registry.setVariantResolver(variantGeometry);
    const collision = new CollisionWorld();
    const model = new BuildModel(registry, collision, variantColliders);
    return { model, collision };
  }

  it("re-derives colliders on edit and restores them exactly on reset", () => {
    const { model, collision } = makeModel();
    const slot: Slot = wallOnEdge(0, 0, 0, "S");
    model.place(slot, { material: "wood" });
    expect(collision.count).toBe(1); // base full wall: one box

    model.applyEdit(slot, "wall#7"); // low wall: 3 tile boxes
    expect(collision.count).toBe(3);

    model.applyEdit(slot, "wall"); // reset to full
    expect(collision.count).toBe(1);
    expect(model.variantAt(slot)).toBe("wall");
  });

  it("re-faces stairs by updating rotation and colliders", () => {
    const { model } = makeModel();
    const slot: Slot = stairsSlot(0, 0, 0);
    model.place(slot, { rotation: 0 });
    model.applyEdit(slot, "stairs", 1); // re-face to ascend +X
    expect(model.get(slot)?.rotation).toBe(1);
  });

  it("keeps material and slot across an edit", () => {
    const { model } = makeModel();
    const slot: Slot = floorSlot(0, 0, 0);
    model.place(slot, { material: "metal" });
    model.applyEdit(slot, `floor#${0xe}`); // corner hole
    const p = model.get(slot)!;
    expect(p.material).toBe("metal");
    expect(p.slot).toEqual(slot);
  });
});
