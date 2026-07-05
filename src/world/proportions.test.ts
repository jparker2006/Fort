import { describe, it, expect } from "vitest";
import { CELL_SIZE, CELL_HEIGHT } from "./grid.ts";
import { PLAYER } from "../player/player-state.ts";

// T23 proportion pins. The rescale to a 4.8 x 4.8 x 3.6 cell exists to match
// Fortnite's build-piece proportions against the (unchanged) 1.8 m player:
// a wall reads exactly half the player's height and one cell is ~2.67 players
// wide, while the 4:3 footprint-to-height ratio of the piece is preserved.
// These ratios are the whole point of the rescale, so they get their own guard.
describe("Fortnite build-piece proportions", () => {
  it("a wall (one storey) is exactly half the standing player's height", () => {
    expect(CELL_HEIGHT / PLAYER.standHeight).toBeCloseTo(2.0, 6);
  });

  it("one cell is ~2.67 standing players wide", () => {
    expect(CELL_SIZE / PLAYER.standHeight).toBeCloseTo(8 / 3, 6);
  });

  it("the cell keeps a 4:3 footprint-to-height ratio", () => {
    expect(CELL_SIZE / CELL_HEIGHT).toBeCloseTo(4 / 3, 6);
  });
});
