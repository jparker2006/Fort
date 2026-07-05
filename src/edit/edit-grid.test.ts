import { describe, it, expect } from "vitest";
import {
  faceFrame,
  tileCount,
  tileAtPoint,
  rayTile,
  tileIndex,
  tileCenter,
} from "./edit-grid.ts";
import { wallOnEdge, floorSlot, stairsSlot, roofSlot } from "../build/slots.ts";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";

describe("edit grid layout", () => {
  it("uses a 3x3 grid for walls and 2x2 for the rest", () => {
    expect(tileCount("wall")).toBe(9);
    expect(tileCount("floor")).toBe(4);
    expect(tileCount("stairs")).toBe(4);
    expect(tileCount("roof")).toBe(4);
  });

  it("frames a Z-axis wall as a vertical panel on the cell face", () => {
    const f = faceFrame(wallOnEdge(0, 0, 0, "S")); // axis z, line 0, span 0
    expect(f.cols).toBe(3);
    expect(f.rows).toBe(3);
    expect(f.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(f.uAxis).toEqual({ x: CELL_SIZE, y: 0, z: 0 }); // columns span X
    expect(f.vAxis).toEqual({ x: 0, y: CELL_HEIGHT, z: 0 }); // rows span Y (cell height)
    expect(f.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("frames a floor as a horizontal 2x2 over the cell footprint", () => {
    const f = faceFrame(floorSlot(1, 0, 2));
    expect(f.cols).toBe(2);
    expect(f.origin.x).toBe(CELL_SIZE);
    expect(f.origin.z).toBe(2 * CELL_SIZE);
    expect(f.normal).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe("tile hit-testing", () => {
  it("maps points across a wall face to the right tiles", () => {
    const f = faceFrame(wallOnEdge(0, 0, 0, "S")); // X in [0, CELL_SIZE], Y in [0, CELL_HEIGHT]
    // Bottom-left corner tile (col 0, row 0) -> index 0.
    expect(tileAtPoint(f, { x: 0.5, y: 0.5, z: 0 })).toBe(0);
    // Center tile (col 1, row 1) -> index 4.
    expect(tileAtPoint(f, { x: 2, y: 1.5, z: 0 })).toBe(4);
    // Top-right tile (col 2, row 2) -> index 8.
    expect(tileAtPoint(f, { x: 3.5, y: 2.7, z: 0 })).toBe(8);
    // Off the grid.
    expect(tileAtPoint(f, { x: 5, y: 1, z: 0 })).toBe(-1);
    expect(tileAtPoint(f, { x: 2, y: 4, z: 0 })).toBe(-1);
  });

  it("resolves a ray sweep to the swept tiles (scripted crosshair deltas)", () => {
    const f = faceFrame(wallOnEdge(0, 0, 0, "S"));
    // Rays fired from in front of the wall (+Z) straight toward -Z, aimed at
    // successive tile centers, resolve to a left-to-right row sweep.
    const swept: number[] = [];
    for (let col = 0; col < 3; col++) {
      const cx = (col + 0.5) * (CELL_SIZE / 3);
      const tile = rayTile(f, { x: cx, y: 1.5, z: 3 }, { x: 0, y: 0, z: -1 });
      swept.push(tile);
    }
    expect(swept).toEqual([tileIndex(f, 0, 1), tileIndex(f, 1, 1), tileIndex(f, 2, 1)]);
  });

  it("a ray pointing away from the face misses", () => {
    const f = faceFrame(wallOnEdge(0, 0, 0, "S"));
    expect(rayTile(f, { x: 2, y: 1.5, z: 3 }, { x: 0, y: 0, z: 1 })).toBe(-1);
  });

  it("tile centers round-trip back to their own tile", () => {
    for (const slot of [wallOnEdge(0, 0, 0, "S"), floorSlot(0, 0, 0), stairsSlot(0, 0, 0), roofSlot(0, 0, 0)]) {
      const f = faceFrame(slot);
      for (let i = 0; i < tileCount(slot.kind === "wall" ? "wall" : "floor"); i++) {
        expect(tileAtPoint(f, tileCenter(f, i))).toBe(i);
      }
    }
  });
});
