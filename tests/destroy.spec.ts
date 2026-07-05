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

const pump = (page: import("@playwright/test").Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);
const count = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.count());
const swing = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.destroy.swing());

// Place a wall ahead of the player and aim the Mattock at it.
async function wallAhead(page: import("@playwright/test").Page, material: string) {
  return page.evaluate((mat) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    // Wall on the south edge of cell (0,2): plane Z=8, spanning X 0..4, 2 ahead.
    f.debug.build.wall(0, 0, 2, "S", { material: mat });
    f.debug.target.setMode("mattock");
    f.debug.pump(2);
    return f.debug.target.info();
  }, material);
}

test("wood breaks in two swings and frees its slot", async ({ page }) => {
  await ready(page);
  await wallAhead(page, "wood");
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  const first = await swing(page);
  expect(first).toBe("damaged");
  await pump(page, 2);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t12-hit.png` });

  const second = await swing(page);
  expect(second).toBe("destroyed");
  await pump(page, 2);
  expect(await count(page)).toBe(before - 1);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t12-break.png` });
});

test("tougher materials take more swings", async ({ page }) => {
  await ready(page);
  await wallAhead(page, "metal"); // 5 hit points

  const results: string[] = [];
  for (let i = 0; i < 5; i++) results.push(await swing(page));
  expect(results.slice(0, 4)).toEqual(["damaged", "damaged", "damaged", "damaged"]);
  expect(results[4]).toBe("destroyed");
});

test("a swing hits only the nearest piece, never one behind it", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 9.5);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.1);
    // Two walls in a line along the aim, both within reach: near at Z=8, far at
    // Z=4. The near one occludes the far one.
    f.debug.build.wall(0, 0, 2, "S", { material: "wood" }); // near (Z=8)
    f.debug.build.wall(0, 0, 1, "S", { material: "wood" }); // far (Z=4)
    f.debug.target.setMode("mattock");
    f.debug.pump(2);
  });
  const nearKey = "wz:2:0:0";
  const farKey = "wz:1:0:0";

  // Two swings destroy only the near wall; the far one keeps full hit points.
  await swing(page);
  await swing(page);
  await pump(page, 2);
  const nearHp = await page.evaluate((k) => (window as unknown as FortWin).__fort.debug.build.hpAt(k), nearKey);
  const farHp = await page.evaluate((k) => (window as unknown as FortWin).__fort.debug.build.hpAt(k), farKey);
  expect(nearHp).toBe(0); // destroyed, gone
  expect(farHp).toBe(2); // untouched, full wood hit points
});

test("destroying a floor drops a player standing on it", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Wall supports a floor one storey up.
    f.debug.build.wall(0, 0, 0, "W");
    f.debug.build.floor(0, 1, 0, { material: "wood" });
    // Stand on the floor and aim the Mattock down at it.
    f.debug.teleport(2, 3.4, 2);
    f.debug.setYaw(0);
    f.debug.setPitch(-1.1);
    f.debug.target.setMode("mattock");
  });
  await pump(page, 6);
  const onFloor = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
  expect(onFloor).toBeGreaterThan(2.5);

  // Two swings break the wood floor; the player falls.
  await swing(page);
  await swing(page);
  await pump(page, 60);
  const fell = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
  expect(fell).toBeLessThan(1);
});

test("spark particles are bounded after many breaks and clean up", async ({ page }) => {
  await ready(page);
  // 100 bursts worth of sparks: the ring buffer caps live particles.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.destroy.burst(100));
  await pump(page, 1);
  const peak = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.destroy.liveParticles());
  expect(peak).toBeLessThanOrEqual(256); // hard bound, no leak

  // After the particle lifetime elapses they retire back toward zero.
  await pump(page, 120);
  const after = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.destroy.liveParticles());
  expect(after).toBe(0);
});
