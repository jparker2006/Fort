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
