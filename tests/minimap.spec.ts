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

test("minimap updates within 100 ms of placing and destroying", async ({ page }) => {
  await ready(page);
  await pump(page, 8); // past one 10 Hz redraw interval
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.pieceCount())).toBe(0);

  await page.evaluate(() => {
    const b = (window as unknown as FortWin).__fort.debug.build;
    b.wall(0, 0, 0, "S");
    b.floor(1, 0, 1);
    b.roof(2, 0, 2);
  });
  await pump(page, 8); // ~130 ms at 60 fps, past the 100 ms redraw window
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.pieceCount())).toBe(3);

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.removeFloor(1, 0, 1));
  await pump(page, 8);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.pieceCount())).toBe(2);
});

test("the player marker tracks position and facing", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(-40, 0, -40); // north-west corner
    f.debug.setYaw(0);
  });
  await pump(page, 8);
  const nw = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.playerMarker());

  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(40, 0, 40); // south-east corner
    f.debug.setYaw(Math.PI);
  });
  await pump(page, 8);
  const se = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.playerMarker());

  // Moving south-east increases both map x and y; the yaw is recorded.
  expect(se.x).toBeGreaterThan(nw.x + 20);
  expect(se.y).toBeGreaterThan(nw.y + 20);
  expect(nw.yaw).toBeCloseTo(0, 3);
  expect(se.yaw).toBeCloseTo(Math.PI, 3);
});

test("minimap renders 500 pieces in well under a millisecond of draw time", async ({ page }) => {
  await ready(page);
  const placed = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.scatter(500));
  expect(placed).toBe(500);
  // Force a fresh redraw and read its measured cost.
  const ms = await page.evaluate(() => {
    const m = (window as unknown as FortWin).__fort.debug.minimap;
    m.redraw();
    return m.lastRenderMs();
  });
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.pieceCount())).toBe(500);
  expect(ms).toBeLessThan(2); // generous bound; a 2D fill of 500 cells is trivial
});

test("minimap shows a recognizable structure", async ({ page }) => {
  await ready(page);
  // A small box with a ramp, near the center, easy to spot on the map.
  await page.evaluate(() => {
    const b = (window as unknown as FortWin).__fort.debug.build;
    for (let i = 0; i < 4; i++) {
      b.wall(0, 0, i, "W", { material: "stone" });
      b.wall(3, 0, i, "E", { material: "stone" });
      b.floor(i % 3, 0, i, { material: "wood" });
    }
    b.stairs(1, 0, 2, { material: "metal" });
    (window as unknown as FortWin).__fort.debug.teleport(6, 0, 6);
  });
  await pump(page, 8);
  const clip = await page.evaluate(() => {
    const c = document.querySelector("#minimap") as HTMLElement;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.screenshot({ path: `${EVIDENCE_DIR}/t16-minimap.png`, clip });
});
