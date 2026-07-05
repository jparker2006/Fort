// "After" evidence for the Fortnite parity build (Run B). Like
// tests/before-evidence.spec.ts this drives ONLY window.__fort.debug and
// page.screenshot and asserts nothing; it re-shoots the Phase 0 compositions at
// the new proportions so each before/after pair can be reviewed side by side.
// T23 seeds it with the proportions shot (the headline of the grid rescale);
// T36 extends it into the complete pair set.

import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE } from "../src/world/grid.ts";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };
type Page = import("@playwright/test").Page;

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

async function ready(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.play());
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

const pump = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);

test("after: player-to-wall-and-floor proportions (T23 rescale)", async ({ page }) => {
  await ready(page);
  await page.evaluate((cell) => {
    const f = (window as unknown as FortWin).__fort;
    // Same composition as before-player-proportions.png: a wood wall on the west
    // edge of cell 0 and a wood floor in cell 0, hero on the floor facing the
    // wall (-X). At the new scale a storey is 3.6 tall against the 1.8 hero, so
    // the hero now reads as exactly half the wall's height. The standoff scales
    // with CELL_SIZE so the framing matches the "before" shot.
    f.debug.build.wall(0, 0, 0, "W", { material: "wood" });
    f.debug.build.floor(0, 0, 0, { material: "wood" });
    f.debug.teleport(0.625 * cell, 0, 0.5 * cell);
    f.debug.setYaw(Math.PI / 2);
    f.debug.setPitch(-0.08);
  }, CELL_SIZE);
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-proportions.png` });
});

test("after: closed 1x1 structure with the half-peak roof (T24)", async ({ page }) => {
  await ready(page);
  await page.evaluate((cell) => {
    const f = (window as unknown as FortWin).__fort;
    // Same closed hut as before-fort-structure.png: four stone walls and a wood
    // floor on cell 0, capped by a metal roof on cell 1. After T24 the roof
    // peaks at half a wall, so the cap now reads low and squat, not a full cone.
    for (const dir of ["N", "S", "E", "W"]) f.debug.build.wall(0, 0, 0, dir, { material: "stone" });
    f.debug.build.floor(0, 0, 0, { material: "wood" });
    f.debug.build.roof(0, 1, 0, { material: "metal" });
    // Stand south of the hut looking -Z (three cells back), tilted up for the roof.
    f.debug.teleport(0.5 * cell, 0, 3 * cell);
    f.debug.setYaw(0);
    f.debug.setPitch(0.08);
  }, CELL_SIZE);
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-fort-structure.png` });
});
