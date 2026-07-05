// Phase 0 "before" evidence: read-only screenshot capture for the Fortnite
// parity audit (docs/audit.md). This spec drives ONLY the window.__fort.debug
// surface and page.screenshot; it changes no src/ behavior and asserts nothing
// about gameplay. It complements tests/verify.spec.ts by capturing angles that
// canonical run does not: a clean third-person idle, player-to-wall
// proportions, the build grid on open ground, a stair run, a closed structure,
// and a wide island/sky establishing shot. All placements respect the support
// rules in src/build/rules.ts (base pieces at cy 0, or self-supporting stacks).

import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };
type Page = import("@playwright/test").Page;

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

// Same deterministic entry as verify.spec.ts: wait for boot, start the session
// (this unpauses the fixed-step sim; without it pump() is a no-op), settle.
async function ready(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.play());
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

const pump = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);

test("before: clean third-person idle on open ground", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 0, 0);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.12);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-third-person-idle.png` });
});

test("before: player-to-wall-and-floor proportions", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // A wall on the west edge of cell 0 (x = 0 plane, z in [0,4], y in [0,3])
    // and a floor in cell 0. Both rest on the ground (cy 0), always supported.
    f.debug.build.wall(0, 0, 0, "W", { material: "wood" });
    f.debug.build.floor(0, 0, 0, { material: "wood" });
    // Stand the hero on the floor a couple of units in front of the wall,
    // facing it (-X), so hero height (~1.8) reads against wall height (3.0).
    f.debug.teleport(2.5, 0, 2);
    f.debug.setYaw(Math.PI / 2);
    f.debug.setPitch(-0.08);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-player-proportions.png` });
});

test("before: build grid lattice and ghost on open ground", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.55); // look down at open ground so the grid fills frame
    f.debug.target.setMode("build");
    f.debug.target.setPiece("floor");
    f.debug.target.setActive(true);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-grid-open-ground.png` });
});

test("before: stair run (self-supporting ramp stack)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Stack stairs in one cell: each storey is supported by the ramp below it,
    // so the whole flight is valid without extra scaffolding.
    for (let cy = 0; cy < 4; cy++) f.debug.build.stairs(0, cy, 0, { material: "wood" });
    // View the flight side-on from +X, looking -X, tilted up to see the rise.
    f.debug.teleport(11, 0, 2);
    f.debug.setYaw(Math.PI / 2);
    f.debug.setPitch(0.22);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-stair-run.png` });
});

test("before: closed 1x1 structure (walls, floor, roof, mixed materials)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // A closed hut on cell 0: four stone walls (cy 0), a wood floor (cy 0),
    // and a metal roof capping the walls (cy 1, supported by the walls below).
    for (const dir of ["N", "S", "E", "W"]) f.debug.build.wall(0, 0, 0, dir, { material: "stone" });
    f.debug.build.floor(0, 0, 0, { material: "wood" });
    f.debug.build.roof(0, 1, 0, { material: "metal" });
    // Stand south of the hut looking -Z, tilted up to include the roof.
    f.debug.teleport(2, 0, 12);
    f.debug.setYaw(0);
    f.debug.setPitch(0.08);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-fort-structure.png` });
});

test("before: wide island, sky, water, and distant hills", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    // Near the south of the island, looking north across it toward the horizon
    // so the grid ground, water ring, distant hills, sky gradient and sun glow
    // all frame together. This is the world-framing / lighting-mood reference.
    f.debug.teleport(0, 1, 45);
    f.debug.setYaw(0);
    f.debug.setPitch(0.03);
  });
  await pump(page, 4);
  await page.screenshot({ path: `${EVIDENCE_DIR}/before-island-wide.png` });
});
