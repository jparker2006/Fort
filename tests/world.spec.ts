import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE } from "../src/world/grid.ts";

const EVIDENCE_DIR = "test-results/evidence";

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

test("empty island renders as a visual baseline with sky, ground, grid", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);
  await page.waitForTimeout(300);

  await page.screenshot({ path: `${EVIDENCE_DIR}/t03-island.png` });

  // Sky, ground, grid overlay, water, and hills are all present in the scene.
  const names = await page.evaluate(() => {
    const g = (window as unknown as { __fort?: { game: { scene: { getObjectByName: (n: string) => unknown } } } }).__fort!;
    return ["sky", "ground", "build-grid", "water", "distant-hills"].map(
      (n) => g.game.scene.getObjectByName(n) != null,
    );
  });
  expect(names).toEqual([true, true, true, true, true]);
  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("grid overlay aligns to the shared cell constant", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);

  // Every grid vertex X and Z must be an exact multiple of CELL_SIZE.
  const aligned = await page.evaluate((cell) => {
    const g = (window as unknown as {
      __fort?: { game: { scene: { getObjectByName: (n: string) => { geometry: { getAttribute: (a: string) => { array: ArrayLike<number>; count: number } } } | undefined } } };
    }).__fort!;
    const grid = g.game.scene.getObjectByName("build-grid");
    if (!grid) return false;
    const pos = grid.geometry.getAttribute("position");
    const arr = pos.array;
    // A grid line endpoint sits on a cell boundary in one axis; the other axis
    // runs to the island edge (also a multiple of CELL_SIZE). Check divisibility
    // via the quotient (float-safe: (x % cell) drifts to ~cell near multiples).
    const onGrid = (v: number) => Math.abs(v / cell - Math.round(v / cell)) < 1e-6;
    for (let i = 0; i < pos.count; i++) {
      if (!onGrid(arr[i * 3] as number)) return false;
      if (!onGrid(arr[i * 3 + 2] as number)) return false;
    }
    return true;
  }, CELL_SIZE);
  expect(aligned).toBe(true);
});
