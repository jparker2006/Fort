import { describe, it, expect } from "vitest";
import {
  CELL_SIZE,
  ISLAND_SIZE,
  ISLAND_HALF,
  CELL_MIN,
  CELL_MAX,
  cellOrigin,
  cellCenter,
  worldToCell,
  cellInBounds,
  clampToIsland,
} from "./grid.ts";

describe("grid math", () => {
  it("island spans the expected world size centered on origin", () => {
    expect(ISLAND_SIZE).toBe(160);
    expect(ISLAND_HALF).toBe(80);
    expect(CELL_MIN).toBe(-20);
    expect(CELL_MAX).toBe(19);
  });

  it("cell origin and center are consistent with cell size", () => {
    expect(cellOrigin(0, 0)).toEqual({ x: 0, z: 0 });
    expect(cellCenter(0, 0)).toEqual({ x: CELL_SIZE / 2, z: CELL_SIZE / 2 });
    expect(cellOrigin(3, -2)).toEqual({ x: 12, z: -8 });
  });

  it("worldToCell is the inverse of cellOrigin (floor semantics)", () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [5, -7],
      [-20, 19],
    ];
    for (const [cx, cz] of cases) {
      const o = cellOrigin(cx, cz);
      // A point just inside the cell resolves back to the same cell.
      expect(worldToCell(o.x + 0.01, o.z + 0.01)).toEqual({ cx, cz });
      // The center resolves back too.
      const c = cellCenter(cx, cz);
      expect(worldToCell(c.x, c.z)).toEqual({ cx, cz });
    }
  });

  it("bounds checks match the island extent", () => {
    expect(cellInBounds(CELL_MIN, CELL_MAX)).toBe(true);
    expect(cellInBounds(CELL_MIN - 1, 0)).toBe(false);
    expect(cellInBounds(0, CELL_MAX + 1)).toBe(false);
  });

  it("clampToIsland keeps a point on the island", () => {
    expect(clampToIsland(200)).toBe(ISLAND_HALF);
    expect(clampToIsland(-200)).toBe(-ISLAND_HALF);
    expect(clampToIsland(10)).toBe(10);
  });
});
