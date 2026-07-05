import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

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
