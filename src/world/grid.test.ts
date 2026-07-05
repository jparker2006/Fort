import { describe, it, expect } from "vitest";
import {
  CELL_SIZE,
  ISLAND_CELLS,
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
    // Island span scales with CELL_SIZE (T23: 4.8 * 40 = 192, half 96); the cell
    // index bounds are count-based and unchanged by the rescale.
    expect(ISLAND_CELLS).toBe(40);
    expect(ISLAND_SIZE).toBeCloseTo(192, 6);
    expect(ISLAND_HALF).toBeCloseTo(96, 6);
    expect(CELL_MIN).toBe(-20);
    expect(CELL_MAX).toBe(19);
  });

  it("cell origin and center are consistent with cell size", () => {
    expect(cellOrigin(0, 0)).toEqual({ x: 0, z: 0 });
    expect(cellCenter(0, 0)).toEqual({ x: CELL_SIZE / 2, z: CELL_SIZE / 2 });
    // Expressed via CELL_SIZE so it stays float-exact against cellOrigin's own
    // cx * CELL_SIZE and rescales automatically.
    expect(cellOrigin(3, -2)).toEqual({ x: 3 * CELL_SIZE, z: -2 * CELL_SIZE });
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
