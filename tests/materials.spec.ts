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

test("procedural materials are byte-deterministic and pairwise distinct (T32)", async ({ page }) => {
  await ready(page);
  const urls = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // A CanvasTexture's `.image` IS its source canvas, so toDataURL() hashes the
    // exact generated pixels. Two fresh generations of the same seed must match.
    const gen = (m: string) => f.debug.build.materialDataURL(m) as string;
    return {
      wood1: gen("wood"),
      wood2: gen("wood"),
      stone1: gen("stone"),
      stone2: gen("stone"),
      metal1: gen("metal"),
      metal2: gen("metal"),
    };
  });

  // Determinism: same seed, identical bytes across regenerations in one run.
  expect(urls.wood1).toBe(urls.wood2);
  expect(urls.stone1).toBe(urls.stone2);
  expect(urls.metal1).toBe(urls.metal2);

  // Wood / stone / metal are pairwise distinct textures.
  expect(urls.wood1).not.toBe(urls.stone1);
  expect(urls.stone1).not.toBe(urls.metal1);
  expect(urls.wood1).not.toBe(urls.metal1);

  // The generated canvas is the T32 resolution.
  const size = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Decode a data URL length sanity check is brittle; instead read back the
    // pool material once a wall exists (below) for the true dimension.
    f.debug.build.wall(0, 0, 0, "S", { material: "wood" });
    const scene = f.game.scene;
    let dim = 0;
    scene.traverse((o: any) => {
      const map = o.material?.map;
      if (map?.image?.width) dim = Math.max(dim, map.image.width);
    });
    return dim;
  });
  expect(size).toBe(256);
});

test("material textures v2 keep the pool and draw-call budget (T32)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(-1, 0, 0, "S", { material: "wood" });
    f.debug.build.wall(0, 0, 0, "S", { material: "stone" });
    f.debug.build.wall(1, 0, 0, "S", { material: "metal" });
  });
  await pump(page, 2);
  const stats = await page.evaluate(() => {
    const b = (window as unknown as FortWin).__fort.debug.build;
    return { count: b.count(), pools: b.drawCalls(), total: b.rendererDrawCalls() };
  });
  expect(stats.count).toBe(3);
  // Three walls of three materials: at most three build pools/draw calls.
  expect(stats.pools).toBeLessThanOrEqual(3);
  expect(stats.total).toBeLessThan(80);
});

test("after: wood, stone, metal wall trio with v2 textures (T32)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(-1, 0, 0, "S", { material: "wood" });
    f.debug.build.wall(0, 0, 0, "S", { material: "stone" });
    f.debug.build.wall(1, 0, 0, "S", { material: "metal" });
    f.debug.teleport(2, 0, -4);
    f.debug.setYaw(Math.PI);
    f.debug.setPitch(-0.05);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-materials.png` });
});
