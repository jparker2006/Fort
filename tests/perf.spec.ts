import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

async function play(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.play());
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

const pump = (page: import("@playwright/test").Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);
const perf = (page: import("@playwright/test").Page, fn: string) =>
  page.evaluate((f) => (window as unknown as FortWin).__fort.debug.perf[f](), fn);

test("600 mixed pieces render in well under 80 draw calls (instancing)", async ({ page }) => {
  await play(page);
  const placed = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.perf.stress(600));
  expect(placed).toBe(600);
  await pump(page, 3);

  // renderer.info draw calls for the whole scene stay well under the 80 bar,
  // because every piece renders through a per-(variant, material) instanced pool.
  const draws = await perf(page, "drawCalls");
  const pools = await perf(page, "buildPools");
  expect(draws).toBeLessThan(80);
  // Base 4x3 plus the handful of edit-variant pools the stress exercises.
  expect(pools).toBeLessThanOrEqual(40);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 6, 40);
    f.debug.setPitch(-0.5);
  });
  await pump(page, 2);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t20-stress.png` });
});

test("movement collision stays O(nearby) with 600 pieces in the world", async ({ page }) => {
  await play(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.perf.stress(600));
  // Drop the player into the middle of the field and step.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 1, 0);
    f.debug.setYaw(0);
  });
  await page.keyboard.down("KeyW");
  await pump(page, 10);
  await page.keyboard.up("KeyW");

  // A movement step examined only a handful of nearby boxes, not the ~1000 in
  // the world (600 pieces x multiple colliders each).
  const comparisons = await perf(page, "nearComparisons");
  expect(comparisons).toBeLessThan(80);
});

test("a 100-piece turbo run triggers no pool reallocation (pre-warmed)", async ({ page }) => {
  await play(page);
  const before = await perf(page, "poolGrows");
  const placed = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.perf.placeRow(100));
  expect(placed).toBe(100);
  await pump(page, 2);
  expect(await perf(page, "poolGrows")).toBe(before); // no growth spike
});

test("the movement hot path does not grow the heap frame over frame", async ({ page }) => {
  // Sustained-movement proxy: pumping hundreds of frames through swiftshader is
  // slow, so give this one a wider budget than the default 60s.
  test.setTimeout(120_000);
  const mem = await page.evaluate(() => "memory" in performance);
  test.skip(!mem, "performance.memory unavailable in this browser");
  await play(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.perf.stress(200);
    f.debug.teleport(0, 1, 0);
    f.debug.setYaw(0);
  });
  await page.keyboard.down("KeyW");
  await pump(page, 60); // warm up
  const m0 = await page.evaluate(() => (performance as any).memory.usedJSHeapSize);
  await pump(page, 300); // sustained movement through the field
  const m1 = await page.evaluate(() => (performance as any).memory.usedJSHeapSize);
  await page.keyboard.up("KeyW");
  // The near-query and player boxes are reused; heap growth over 600 frames of
  // movement stays tiny (generous bound absorbs GC and unrelated allocations).
  expect(m1 - m0).toBeLessThan(4 * 1024 * 1024);
});
