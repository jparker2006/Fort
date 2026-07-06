import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ghostValidHex } from "../src/build/ghost.ts";

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

const info = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.info());

// Aim the player down-and-forward at open ground and enter build mode.
async function enterBuild(page: import("@playwright/test").Page, piece: string) {
  await page.evaluate((p) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 2);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.7);
    f.debug.target.setActive(true);
    f.debug.target.setPiece(p);
  }, piece);
  await pump(page, 3);
}

test("wall ghost is blue when valid and red when the slot is occupied", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await enterBuild(page, "wall");

  const blue = await info(page);
  expect(blue.valid).toBe(true);
  expect(blue.ghost).toBe("valid");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t10-wall-blue.png` });

  // Occupy the exact target slot; re-resolving the same aim is now blocked.
  await page.evaluate((key) => (window as unknown as FortWin).__fort.debug.build.placeSlotKey(key), blue.key);
  await pump(page, 2);
  const red = await info(page);
  expect(red.key).toBe(blue.key); // same target
  expect(red.valid).toBe(false);
  expect(red.ghost).toBe("invalid");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t10-wall-red.png` });

  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("stairs ghost is blue when valid and red when the slot is occupied", async ({ page }) => {
  await ready(page);
  await enterBuild(page, "stairs");

  const blue = await info(page);
  expect(blue.valid).toBe(true);
  expect(blue.ghost).toBe("valid");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t10-stairs-blue.png` });

  await page.evaluate((key) => (window as unknown as FortWin).__fort.debug.build.placeSlotKey(key), blue.key);
  await pump(page, 2);
  const red = await info(page);
  expect(red.valid).toBe(false);
  expect(red.ghost).toBe("invalid");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t10-stairs-red.png` });
});

test("rotate cycles the stair ghost through four distinct facings", async ({ page }) => {
  await ready(page);
  await enterBuild(page, "stairs");

  const facings = new Set<number>();
  const first = await info(page);
  facings.add(first.rotation);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t10-stairs-rot0.png` });

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.cycleRotation());
    await pump(page, 2);
    const t = await info(page);
    facings.add(t.rotation);
    if (i === 0) await page.screenshot({ path: `${EVIDENCE_DIR}/t10-stairs-rot1.png` });
  }
  expect(facings.size).toBe(4);
});

// Cycle the build controller to a specific material.
async function selectMaterial(page: import("@playwright/test").Page, material: string) {
  await page.evaluate((target) => {
    const f = (window as unknown as FortWin).__fort;
    let guard = 0;
    while (f.debug.target.material() !== target && guard++ < 5) f.debug.target.cycleMaterial();
  }, material);
  await pump(page, 2);
}

test("a valid ghost tints toward each selected material (T34)", async ({ page }) => {
  await ready(page);
  await enterBuild(page, "wall");

  for (const m of ["wood", "stone", "metal"] as const) {
    await selectMaterial(page, m);
    const probe = await page.evaluate(() => {
      const f = (window as unknown as FortWin).__fort;
      return { valid: f.debug.target.info().valid, hex: f.debug.target.ghostColorHex() };
    });
    expect(probe.valid).toBe(true);
    expect(probe.hex).toBe(ghostValidHex(m)); // exact blended hex, per material
  }

  // Opacity and renderOrder are untouched by the tint (T34 acceptance).
  const meta = await page.evaluate(() => {
    let ghost: any = null;
    (window as unknown as FortWin).__fort.game.scene.traverse((o: any) => {
      if (o.name === "build-ghost") ghost = o;
    });
    return { opacity: ghost.material.opacity, renderOrder: ghost.renderOrder };
  });
  expect(meta.opacity).toBeCloseTo(0.42, 5);
  expect(meta.renderOrder).toBe(10);
});

test("an invalid ghost stays pure red regardless of material (T34)", async ({ page }) => {
  await ready(page);
  await enterBuild(page, "wall");
  await selectMaterial(page, "metal");
  const blue = await info(page);
  // Occupy the slot so the same target reads invalid.
  await page.evaluate((key) => (window as unknown as FortWin).__fort.debug.build.placeSlotKey(key), blue.key);
  await pump(page, 2);
  const redHex = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.ghostColorHex());
  expect(redHex).toBe(0xff3b30); // invalid never tints
});

test("after: material-tinted valid ghost (T34)", async ({ page }) => {
  await ready(page);
  await enterBuild(page, "wall");
  await selectMaterial(page, "metal"); // most visible tint shift
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-ghost-materials.png` });
});
