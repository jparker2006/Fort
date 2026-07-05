import { describe, it, expect } from "vitest";
import { resolveTarget, buildLevel, BUILD_REACH, type TargetContext } from "./targeting.ts";
import { slotKey, wallOnEdge, floorSlot, stairsSlot, roofSlot } from "./slots.ts";
import type { PieceType, Rotation } from "./piece.ts";

// A downward aim ray hitting a ground point (X,Z), with the player at the given
// spot. Origin is straight above the hit so the plane projection lands exactly.
function aimDownAt(
  hitX: number,
  hitZ: number,
  type: PieceType,
  player = { x: 0, z: 0, feetY: 0 },
  rotationOffset: Rotation = 0,
): TargetContext {
  return {
    origin: { x: hitX, y: 10, z: hitZ },
    dir: { x: 0, y: -1, z: 0 },
    playerX: player.x,
    playerZ: player.z,
    playerFeetY: player.feetY,
    type,
    rotationOffset,
  };
}

describe("build level", () => {
  it("maps feet height to the storey being built on", () => {
    expect(buildLevel(0)).toBe(0);
    expect(buildLevel(3)).toBe(1);
    expect(buildLevel(6)).toBe(2);
  });
});

describe("target resolution (ray to slot)", () => {
  it("floors snap to the aimed cell at the build level", () => {
    // Player near origin, aim at (6,6) -> cell (1,1).
    const t = resolveTarget(aimDownAt(6, 6, "floor", { x: 2, z: 2, feetY: 0 }));
    expect(slotKey(t.slot)).toBe(slotKey(floorSlot(1, 0, 1)));
    expect(t.rotation).toBe(0);
  });

  it("walls snap to the cell edge nearest the aim point", () => {
    // Aim just inside the east edge of cell (1,1): x=7.9 -> east edge.
    const east = resolveTarget(aimDownAt(7.9, 6, "wall", { x: 2, z: 6, feetY: 0 }));
    expect(slotKey(east.slot)).toBe(slotKey(wallOnEdge(1, 0, 1, "E")));
    // Aim just inside the west edge: x=4.1 -> west edge.
    const west = resolveTarget(aimDownAt(4.1, 6, "wall", { x: 6, z: 6, feetY: 0 }));
    expect(slotKey(west.slot)).toBe(slotKey(wallOnEdge(1, 0, 1, "W")));
    // Aim near the south edge: z=4.1 -> south edge.
    const south = resolveTarget(aimDownAt(6, 4.1, "wall", { x: 6, z: 8, feetY: 0 }));
    expect(slotKey(south.slot)).toBe(slotKey(wallOnEdge(1, 0, 1, "S")));
  });

  it("stairs face away from the player by default", () => {
    // Cell (2,0) is in +X from a player at the origin: ramp ascends +X (rot 1).
    const t = resolveTarget(aimDownAt(10, 0, "stairs", { x: 0, z: 0, feetY: 0 }));
    expect(slotKey(t.slot)).toBe(slotKey(stairsSlot(2, 0, 0)));
    expect(t.rotation).toBe(1);
    // A player on the +X side sees the ramp ascend -X (rot 3).
    const back = resolveTarget(aimDownAt(0, 0, "stairs", { x: 10, z: 0, feetY: 0 }));
    expect(back.rotation).toBe(3);
  });

  it("the rotate offset cycles stair facing through all four", () => {
    const seen = new Set<number>();
    for (let o = 0; o < 4; o++) {
      const t = resolveTarget(aimDownAt(10, 0, "stairs", { x: 0, z: 0, feetY: 0 }, o as Rotation));
      seen.add(t.rotation);
    }
    expect(seen.size).toBe(4);
  });

  it("cones target the aimed cell top", () => {
    const t = resolveTarget(aimDownAt(6, 6, "roof", { x: 2, z: 2, feetY: 0 }));
    expect(slotKey(t.slot)).toBe(slotKey(roofSlot(1, 0, 1)));
  });

  it("builds at the player's storey when standing on a piece", () => {
    // Feet at y=3 -> build level 1; aim down resolves the cell at cy=1.
    const t = resolveTarget(aimDownAt(6, 6, "floor", { x: 2, z: 2, feetY: 3 }));
    expect(slotKey(t.slot)).toBe(slotKey(floorSlot(1, 1, 1)));
  });

  it("clamps the target to within build reach of the player", () => {
    // Aim far past reach along +X: the target clamps to BUILD_REACH away.
    const t = resolveTarget(aimDownAt(100, 0, "floor", { x: 0, z: 0, feetY: 0 }));
    const s = t.slot;
    if (s.kind !== "floor") throw new Error("expected floor");
    // Clamped hit is at x = BUILD_REACH (=12) -> cell floor(12/4)=3.
    expect(s.cx).toBe(Math.floor(BUILD_REACH / 4));
    expect(s.cz).toBe(0);
  });
});
