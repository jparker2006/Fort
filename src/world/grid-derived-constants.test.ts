import { describe, it, expect } from "vitest";
import { CELL_SIZE } from "./grid.ts";
import { BUILD_REACH } from "../build/targeting.ts";
import { EDIT_REACH } from "../edit/edit-controller.ts";
import { MATTOCK_REACH } from "../build/destroy-controller.ts";
import { BUCKET } from "../player/collision.ts";

// T22 pin test. Four constants that used to be bare literals are now derived
// from CELL_SIZE. This test pins both halves: the grid-derived expression AND
// the concrete value it currently evaluates to. When T23 rescales CELL_SIZE
// from 4 to 4.8, exactly these expected numbers move (12/9/9/8 -> 14.4/10.8/
// 10.8/9.6), so the rescale shows up here as a deliberate, reviewable change
// rather than a silently stale literal somewhere else in the tree.
describe("grid-derived reach and bucket constants", () => {
  it("BUILD_REACH is 3 build cells", () => {
    expect(BUILD_REACH).toBe(3 * CELL_SIZE);
    expect(BUILD_REACH).toBe(12);
  });

  it("EDIT_REACH is 2.25 build cells", () => {
    expect(EDIT_REACH).toBe(2.25 * CELL_SIZE);
    expect(EDIT_REACH).toBe(9);
  });

  it("MATTOCK_REACH matches EDIT_REACH at 2.25 build cells", () => {
    expect(MATTOCK_REACH).toBe(2.25 * CELL_SIZE);
    expect(MATTOCK_REACH).toBe(9);
    expect(MATTOCK_REACH).toBe(EDIT_REACH);
  });

  it("BUCKET (spatial-hash cell) is 2 build cells", () => {
    expect(BUCKET).toBe(2 * CELL_SIZE);
    expect(BUCKET).toBe(8);
  });
});
