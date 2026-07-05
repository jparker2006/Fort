import { describe, it, expect } from "vitest";
import { CollisionWorld, makeBox, boxesOverlap } from "./collision.ts";

describe("collision spatial hash", () => {
  it("near() returns only boxes in the queried region, not the whole world", () => {
    const world = new CollisionWorld();
    // A far-flung field of boxes plus one next to the origin.
    for (let i = 0; i < 500; i++) world.add(makeBox(200 + i * 4, 1, 200, 1, 3, 1));
    const nearHandle = world.add(makeBox(1, 1, 1, 1, 3, 1));
    expect(world.count).toBe(501);

    void nearHandle;
    const query = makeBox(1, 1, 1, 2, 2, 2);
    const out: ReturnType<typeof makeBox>[] = [];
    world.near(query, out);
    // Only the nearby box (and any sharing its buckets) come back, not all 501.
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeLessThan(10);
    expect(out.some((b) => boxesOverlap(b, query))).toBe(true);
    expect(world.lastNearComparisons).toBeLessThan(10);
  });

  it("reuses the output array (no per-query allocation)", () => {
    const world = new CollisionWorld();
    world.add(makeBox(0, 1, 0, 2, 2, 2));
    const out: ReturnType<typeof makeBox>[] = [];
    const a = world.near(makeBox(0, 1, 0, 2, 2, 2), out);
    const b = world.near(makeBox(0, 1, 0, 2, 2, 2), out);
    expect(a).toBe(out);
    expect(b).toBe(out);
  });

  it("removing a box drops it from its buckets", () => {
    const world = new CollisionWorld();
    const h = world.add(makeBox(4, 1, 4, 2, 2, 2));
    const out: ReturnType<typeof makeBox>[] = [];
    expect(world.near(makeBox(4, 1, 4, 1, 1, 1), out).length).toBe(1);
    world.remove(h);
    expect(world.near(makeBox(4, 1, 4, 1, 1, 1), out).length).toBe(0);
    expect(world.count).toBe(0);
  });

  it("returns a box spanning several buckets exactly once", () => {
    const world = new CollisionWorld();
    world.add(makeBox(0, 1, 0, 40, 2, 40)); // spans many buckets
    const out: ReturnType<typeof makeBox>[] = [];
    world.near(makeBox(0, 1, 0, 30, 2, 30), out);
    expect(out.length).toBe(1);
  });
});
