import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE, CELL_HEIGHT } from "../src/world/grid.ts";
import { MOVE } from "../src/player/movement-tuning.ts";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

// Pump frames while sampling player position each frame; runs in one evaluate so
// held keys stay down throughout.
function run(page: import("@playwright/test").Page, frames: number) {
  return page.evaluate((n) => {
    const f = (window as unknown as FortWin).__fort;
    const ys: number[] = [];
    const pos: Array<{ y: number; z: number; ground: boolean }> = [];
    for (let i = 0; i < n; i++) {
      f.debug.pump(1);
      const p = f.debug.playerPos();
      ys.push(p.y);
      pos.push({ y: p.y, z: p.z, ground: f.debug.onGround() });
    }
    const maxY = Math.max(...ys);
    let maxStep = 0;
    for (let i = 1; i < ys.length; i++) maxStep = Math.max(maxStep, Math.abs(ys[i]! - ys[i - 1]!));
    return { maxY, maxStep, last: pos[pos.length - 1]! };
  }, frames);
}

test("jumps onto a low wall (top below apex)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0); // forward is -Z
    f.debug.teleport(0, 0, 3.8);
    // Deep low platform: top at 1.2 (below the ~1.5 apex), front edge at z = 3.
    f.debug.placeSolid(0, 0.6, -20, 4, 1.2, 46);
    f.debug.pump(2);
  });

  await page.keyboard.down("KeyW");
  await run(page, 20);
  await page.keyboard.down("Space");
  const r = await run(page, 120);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");

  // Ended up standing on the wall top.
  expect(r.last.y).toBeGreaterThan(1.0);
  expect(r.last.ground).toBe(true);
});

test("cannot jump onto a full-height wall (top above apex)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0);
    f.debug.teleport(0, 0, 3.8);
    // Deep full-height platform: top at 3.0, well above the jump apex.
    f.debug.placeSolid(0, 1.5, -20, 4, 3.0, 46);
    f.debug.pump(2);
  });

  await page.keyboard.down("KeyW");
  await run(page, 20);
  await page.keyboard.down("Space");
  const r = await run(page, 120);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");

  // Never got on top: peak height stayed near the jump apex, ended on the ground.
  expect(r.maxY).toBeLessThan(1.7);
  expect(r.last.y).toBeLessThan(0.5);
});

test("ascends a staircase of steps smoothly at sprint speed", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0);
    f.debug.teleport(0, 0, 6);
    // A flight of steps rising in -Z, each 0.4 tall (within step height), each
    // deep enough to stand on.
    for (let i = 0; i < 8; i++) {
      const top = (i + 1) * 0.4;
      f.debug.placeSolid(0, top / 2, 4 - i * 1.2, 4, top, 1.4);
    }
    f.debug.pump(2);
  });

  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft"); // sprint
  const r = await run(page, 120);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");

  // Climbed high (multiple steps) and never popped by more than a step height.
  expect(r.maxY).toBeGreaterThan(1.2);
  expect(r.maxStep).toBeLessThanOrEqual(0.6 + 0.01);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t06-stairs.png` });
});

test("walks a real stair ramp up a full storey after the T23 rescale", async ({ page }) => {
  await ready(page);
  await page.evaluate((v) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(Math.PI); // face +Z, the ramp's ascending direction
    // Start just south of the ramp's low edge (cell 0 spans z 0..CELL_SIZE), on
    // the cell's mid-X, then build one real stairs piece ascending +Z.
    f.debug.teleport(0.5 * v.cell, 0, -1.5);
    f.debug.build.stairs(0, 0, 0, { rotation: 0 });
    f.debug.pump(2);
  }, { cell: CELL_SIZE });

  await page.keyboard.down("KeyW");
  const r = await run(page, 220);
  await page.keyboard.up("KeyW");

  // Climbed a full storey (~CELL_HEIGHT = 3.6) and never popped by more than one
  // tread: proof that STAIR_STEPS 7 keeps the taller cell's ramp walkable.
  expect(r.maxY).toBeGreaterThan(CELL_HEIGHT - 0.4);
  expect(r.maxStep).toBeLessThanOrEqual(MOVE.stepHeight + 0.01);
});

test("stands on a roof apex at half a wall after the T24 peak change", async ({ page }) => {
  await ready(page);
  await page.evaluate((v) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.roof(0, 0, 0, { material: "wood" });
    // Drop straight down onto the apex (cell centre) from just above the peak.
    f.debug.teleport(0.5 * v.cell, v.h / 2 + 0.6, 0.5 * v.cell);
    f.debug.pump(30); // settle onto the apex
  }, { cell: CELL_SIZE, h: CELL_HEIGHT });

  const y = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
  // Cell base (0) + half a wall: the apex sits at CELL_HEIGHT / 2 = 1.8.
  expect(y).toBeGreaterThan(CELL_HEIGHT / 2 - 0.1);
  expect(y).toBeLessThan(CELL_HEIGHT / 2 + 0.15);
});

test("a jog covers one cell in its cross-time, measured at steady speed (T27)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0); // forward is -Z
    f.debug.teleport(0, 0, 20);
  });

  await page.keyboard.down("KeyW");
  // Spin up to steady run speed first (groundAccel 60 reaches runSpeed in ~0.08 s;
  // 30 pumped frames is ~0.5 s, well past it), so we measure cruising, not accel.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(30));
  const z0 = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().z);

  // Measure across one cell-cross window: CELL_SIZE / runSpeed seconds, and each
  // pumped frame advances 1/60 s of sim.
  const windowFrames = Math.round((CELL_SIZE / MOVE.runSpeed) * 60);
  await page.evaluate((n) => (window as unknown as FortWin).__fort.debug.pump(n), windowFrames);
  const z1 = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().z);
  await page.keyboard.up("KeyW");

  const displacement = Math.abs(z1 - z0);
  // The integrated jog crosses ~one 4.8 cell over its 1.02 s window; the old 5.5
  // speed would overshoot well past this band, so it fails loudly on a regression.
  expect(displacement).toBeGreaterThan(CELL_SIZE - 0.25);
  expect(displacement).toBeLessThan(CELL_SIZE + 0.25);
});

test("a bare jump apexes about a quarter up a full wall and cannot mount it (T28)", async ({ page }) => {
  await ready(page);
  await page.evaluate((cell) => {
    const f = (window as unknown as FortWin).__fort;
    // A real full-height wall (CELL_HEIGHT = 3.6) on the south edge of cell 0.
    f.debug.build.wall(0, 0, 0, "S", { material: "stone" });
    f.debug.setYaw(Math.PI); // face +Z, toward the wall
    f.debug.teleport(0.5 * cell, 0, -1.2); // stand just south of it
    f.debug.pump(2);
  }, CELL_SIZE);

  // Walk into the wall and jump from flat ground.
  await page.keyboard.down("KeyW");
  await run(page, 15);
  await page.keyboard.down("Space");
  const rise = await run(page, 22); // ~riseTime: near the apex
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-jump-vs-wall.png` });
  const fall = await run(page, 70); // finish the arc back to the ground
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");

  const maxY = Math.max(rise.maxY, fall.maxY);
  // Apex near 0.9 (a quarter of the 3.6 wall), far below its 3.6 top, and the
  // player never climbs on: the retuned hop cannot mount a full wall.
  expect(maxY).toBeGreaterThan(0.6);
  expect(maxY).toBeLessThan(1.3);
  expect(fall.last.y).toBeLessThan(0.3); // ended on the ground, did not mount
});

test("running into a wall does not explode or produce NaN", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0);
    f.debug.teleport(0, 0, 4);
    f.debug.placeSolid(0, 1.5, 1.0, 4, 3.0, 0.4);
    f.debug.pump(2);
  });

  await page.keyboard.down("KeyW");
  await run(page, 200);
  await page.keyboard.up("KeyW");

  const pos = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos());
  expect(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)).toBe(true);
  // Stopped just in front of the wall (front face at z = 1.2, plus radius),
  // did not tunnel through or launch into the air.
  expect(pos.z).toBeGreaterThan(1.3);
  expect(pos.z).toBeLessThan(4.1);
  expect(pos.y).toBeLessThan(0.2);
});
