// T21: consolidated real-browser verification. One suite that drives the game
// through synthetic input and archives the canonical evidence set to
// test-results/evidence/ for human review. It complements the exhaustive
// per-ticket specs with the headline end-to-end flow (place a wall, edit a
// window into it, destroy it) and the tolerant ghost colour check, and
// re-captures the key screenshots in one reviewable place.

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };
type Page = import("@playwright/test").Page;

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

// Deterministic entry: wait for boot, start the session (enables input and the
// fixed-step sim), and settle a couple of frames. Using debug.session.play()
// rather than a raw click is the reliable headless start (see T18/T20 notes).
async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.play());
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

const pump = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);
const count = (page: Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.count());
const variantAt = (page: Page, key: string) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.build.variantAt(k), key);
const targetInfo = (page: Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.info());
const mode = (page: Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.mode());
const editState = (page: Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.edit.state());
const ghostHex = (page: Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.ghostColorHex());

// The window edit removes the center tile (index 4) of the 3x3 wall grid,
// leaving the other eight tiles solid (matches T14's canonical mask).
const WINDOW_VARIANT = `wall#${0x1ff & ~(1 << 4)}`;

test("full gameplay flow: place a wall, edit a window into it, destroy it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);

  // Aim at open ground just ahead (steep enough that the wall lands one cell
  // away, well inside edit and Mattock reach) and enter build mode via the key.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.7);
  });
  await page.keyboard.press("KeyZ"); // buildWall bind -> build mode + wall selected
  await pump(page, 3);
  expect(await mode(page)).toBe("build");

  // --- Step 1: place the wall with a synthetic primary-fire click. ---
  const target = await targetInfo(page);
  expect(target.valid).toBe(true);
  expect(target.ghost).toBe("valid");
  const key: string = target.key;
  expect(await count(page)).toBe(0);

  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 2);
  expect(await count(page)).toBe(1);
  expect(await variantAt(page, key)).toBe("wall"); // a full wall now exists
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-flow-1-place.png` });

  // --- Step 2: edit a window into it (enter edit, select center tile, confirm). ---
  await page.keyboard.press("KeyG"); // edit bind, targets the piece under the crosshair
  await pump(page, 3);
  const es = await editState(page);
  expect(es.editing).toBe(true);
  expect(es.type).toBe("wall");

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.edit.forceHover(4));
  await page.mouse.down(); // drag-select the center tile
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);
  expect((await editState(page)).selected).toEqual([4]);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-flow-2-edit.png` });

  await page.keyboard.press("KeyG"); // confirm the edit, exit edit mode
  await pump(page, 3);
  expect((await editState(page)).editing).toBe(false);
  expect(await variantAt(page, key)).toBe(WINDOW_VARIANT); // the wall is now a window
  expect(await count(page)).toBe(1); // still one piece, re-shaped in place

  // --- Step 3: destroy it with the Mattock via held synthetic primary fire. ---
  await page.keyboard.press("KeyB"); // build/combat toggle -> Mattock carry
  await pump(page, 3);
  expect(await mode(page)).toBe("mattock");
  // Aim at a solid tile so the swing never slips through the window hole.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.setPitch(-0.6));
  await pump(page, 2);

  await page.mouse.down(); // hold: swings on an interval until wood (2 HP) breaks
  await pump(page, 60);
  await page.mouse.up();
  await pump(page, 2);
  expect(await count(page)).toBe(0); // destroyed and its slot freed
  expect(await variantAt(page, key)).toBeNull();
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-flow-3-destroy.png` });

  expect(errors).toEqual([]);
});

test("ghost is blue on a valid slot and red on an occupied one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    f.debug.target.setActive(true);
    f.debug.target.setPiece("wall");
  });
  await pump(page, 3);

  // Clip tight to the crosshair region where the ghost renders.
  const clip = { x: 520, y: 240, width: 240, height: 240 };

  // Valid slot: the ghost is blue (0x2f7fff), blue channel dominant.
  let info = await targetInfo(page);
  expect(info.ghost).toBe("valid");
  const blueHex: number = await ghostHex(page);
  expect(blueHex).toBe(0x2f7fff);
  expect(blueHex & 0xff).toBeGreaterThan((blueHex >> 16) & 0xff); // B > R
  const blueShot = await page.screenshot({ path: `${EVIDENCE_DIR}/t21-ghost-blue.png`, clip });

  // Occupy the slot: the same target now reads invalid and the ghost turns red.
  await page.evaluate((k) => (window as unknown as FortWin).__fort.debug.build.placeSlotKey(k), info.key);
  await pump(page, 3);
  info = await targetInfo(page);
  expect(info.ghost).toBe("invalid");
  const redHex: number = await ghostHex(page);
  expect(redHex).toBe(0xff3b30);
  expect((redHex >> 16) & 0xff).toBeGreaterThan(redHex & 0xff); // R > B
  const redShot = await page.screenshot({ path: `${EVIDENCE_DIR}/t21-ghost-red.png`, clip });

  // The ghost region visibly changed between the two states.
  expect(Buffer.compare(blueShot, redShot)).not.toBe(0);
});

test("canonical HUD evidence: build tray and edit crosshair at 1080p", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);

  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("stairs");
  });
  await pump(page, 2);
  await expect(page.locator("#hud-tray .tray-slot")).toHaveCount(4);
  await expect(page.locator('.tray-slot[data-piece="stairs"]')).toHaveClass(/active/);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-hud-build.png` });

  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    f.debug.build.wall(0, 0, 2, "S");
    f.debug.pump(2);
  });
  await page.keyboard.press("KeyG");
  await pump(page, 2);
  await expect(page.locator("#hud-crosshair")).toHaveAttribute("data-mode", "edit");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-hud-edit.png` });
});

test("canonical minimap evidence: a recognizable structure", async ({ page }) => {
  await ready(page);
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
    const r = (document.querySelector("#minimap") as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.minimap.pieceCount())).toBeGreaterThan(0);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-minimap.png`, clip });
});

test("canonical materials evidence: wood, stone, metal are distinct", async ({ page }) => {
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
  await page.screenshot({ path: `${EVIDENCE_DIR}/t21-materials.png` });
});
