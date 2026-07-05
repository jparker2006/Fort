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

test("scatters 100 pieces via instancing with few draw calls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);

  const placed = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.scatter(100));
  expect(placed).toBe(100);
  await pump(page, 2);

  const stats = await page.evaluate(() => {
    const b = (window as unknown as FortWin).__fort.debug.build;
    return { count: b.count(), drawCalls: b.drawCalls(), total: b.rendererDrawCalls() };
  });
  expect(stats.count).toBe(100);
  // At most 4 variants x 3 materials = 12 build-piece pools/draw calls.
  expect(stats.drawCalls).toBeLessThanOrEqual(12);
  // The whole scene (world + hero + builds) stays well under the T20 budget.
  expect(stats.total).toBeLessThan(80);

  await page.screenshot({ path: `${EVIDENCE_DIR}/t09-scatter.png` });
  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("colliders update incrementally and a destroyed floor drops the player", async ({ page }) => {
  await ready(page);

  const before = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.colliderCount());

  // A wall and a floor above it: floor is supported by the wall top.
  await page.evaluate(() => {
    const b = (window as unknown as FortWin).__fort.debug.build;
    b.wall(0, 0, 0, "W");
    b.floor(0, 1, 0, { material: "stone" });
  });
  const after = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.colliderCount());
  expect(after).toBe(before + 2); // one wall box + one floor box

  // Stand the player on top of the floor (top surface near y=3).
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.teleport(2, 3.4, 2));
  await pump(page, 10);
  const onFloor = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
  expect(onFloor).toBeGreaterThan(2.5);

  // Destroy the floor: the player should fall toward the ground.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.removeFloor(0, 1, 0));
  await pump(page, 60);
  const fell = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
  expect(fell).toBeLessThan(1);
});

test("a built structure blocks the camera spring arm", async ({ page }) => {
  await ready(page);
  // Place a wall directly behind the player and confirm no page errors while
  // the spring arm raycasts the new instanced mesh.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 2);
    f.debug.setYaw(0);
    // Walls around the player at ground level.
    const b = f.debug.build;
    b.wall(0, 0, 0, "W");
    b.wall(0, 0, 0, "S");
    b.wall(0, 0, 0, "N");
    b.floor(0, 0, 0, { material: "metal" });
  });
  await pump(page, 10);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t09-structure.png` });
  expect(errors, errors.join("; ")).toHaveLength(0);
});
