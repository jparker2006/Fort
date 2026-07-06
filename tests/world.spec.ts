import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE } from "../src/world/grid.ts";
import { PALETTE } from "../src/world/palette.ts";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

const pump = (page: import("@playwright/test").Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);

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

test("the lighting rig reports the ACES grade and the T31 rig (deterministic probe)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);

  const rig = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.world.lighting());

  // Tone mapping + exposure come straight off the renderer (no pixel reads).
  expect(rig.toneMapping).toBe("aces");
  expect(rig.exposure).toBeCloseTo(1.15, 5);

  // Retained hemisphere + sun intensities and their palette tints.
  expect(rig.hemisphere).toBeCloseTo(1.25, 5);
  expect(rig.sun).toBeCloseTo(1.8, 5);
  expect(rig.hemiSky).toBe(PALETTE.hemiSky);
  expect(rig.hemiGround).toBe(PALETTE.hemiGround);
  expect(rig.sunColor).toBe(PALETTE.sun);
});

test("the lighting grade does not change the scene draw-call count", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await pump(page, 2);

  // Tone mapping is a post step on the same single scene render: no extra pass.
  const calls = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.rendererDrawCalls());
  expect(calls).toBeLessThan(80); // same budget the T20 perf spec holds
});

test("after: wide island under the ACES grade (T31)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Same composition as before-island-wide: south of the island looking north.
    f.debug.teleport(0, 1, 45);
    f.debug.setYaw(0);
    f.debug.setPitch(0.03);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-lighting-wide.png` });
});

test("the sky exposes its three-stop gradient uniforms (T33)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);

  const sky = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.world.sky());
  expect(sky.zenith).toBe(PALETTE.skyZenith);
  expect(sky.mid).toBe(PALETTE.skyMid);
  expect(sky.horizon).toBe(PALETTE.skyHorizon);
  expect(sky.sunColor).toBe(PALETTE.sunGlow);

  // Still a single sky mesh; the v2 shader adds no extra pass.
  const skyMeshes = await page.evaluate(() => {
    let n = 0;
    (window as unknown as FortWin).__fort.game.scene.traverse((o: any) => {
      if (o.name === "sky") n++;
    });
    return n;
  });
  expect(skyMeshes).toBe(1);
});

test("the sky renders a deterministic frame within one run (T33)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Look up so the clip is pure sky (gradient + cloud band), no hero in frame.
    f.debug.teleport(0, 1, 0);
    f.debug.setYaw(0);
    f.debug.setPitch(0.5);
    f.debug.pump(6);
    // Freeze the sim so the live rAF loop cannot drift the camera spring between
    // the two captures. The sky has no time uniform and deterministic noise, so
    // the frozen frame is byte-identical on every re-render.
    f.debug.settings.open();
  });

  const clip = { x: 0, y: 0, width: 700, height: 120 };
  const a = await page.screenshot({ clip });
  const b = await page.screenshot({ clip });
  expect(Buffer.compare(a, b)).toBe(0);

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.close());
});

test("after: sky v2 gradient, clouds, and sun (T33)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // South of the island, looking north and tilted up so the horizon cloud
    // band, gradient, and sun glow all frame together.
    f.debug.teleport(0, 1, 45);
    f.debug.setYaw(0);
    f.debug.setPitch(0.28);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-sky.png` });
});

test("after: lit mixed-material hut under the ACES grade (T31)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await pump(page, 2);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Same composition as before-fort-structure: stone walls, wood floor, metal
    // roof, viewed from the south so the lit materials read together.
    for (const dir of ["N", "S", "E", "W"]) f.debug.build.wall(0, 0, 0, dir, { material: "stone" });
    f.debug.build.floor(0, 0, 0, { material: "wood" });
    f.debug.build.roof(0, 1, 0, { material: "metal" });
    f.debug.teleport(2, 0, 12);
    f.debug.setYaw(0);
    f.debug.setPitch(0.08);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-materials-lit.png` });
});
