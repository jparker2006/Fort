import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE } from "../src/world/grid.ts";

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
const editState = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.edit.state());
const forceHover = (page: import("@playwright/test").Page, i: number | null) =>
  page.evaluate((idx) => (window as unknown as FortWin).__fort.debug.edit.forceHover(idx), i);

// Place a wall ahead, aim the crosshair at it, and enter edit mode with G.
async function editWall(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    f.debug.build.wall(0, 0, 2, "S"); // wall at Z=8, 2 ahead
    f.debug.pump(2);
  });
  await page.keyboard.press("KeyG"); // edit
  await pump(page, 2);
}

test("edit enters on an owned piece and shows a 3x3 wall grid", async ({ page }) => {
  await ready(page);
  await editWall(page);
  const s = await editState(page);
  expect(s.editing).toBe(true);
  expect(s.type).toBe("wall");
  expect(s.selected).toEqual([]); // full wall starts with an empty selection
});

test("drag-select sweeps tiles, and a second drag over them deselects", async ({ page }) => {
  await ready(page);
  await editWall(page);

  // Drag across tiles 0,1,2 (a bottom row sweep): the drag starts on an
  // unselected tile, so it selects.
  await forceHover(page, 0);
  await page.mouse.down();
  await pump(page, 1);
  for (const t of [1, 2]) {
    await forceHover(page, t);
    await pump(page, 1);
  }
  await page.mouse.up();
  await pump(page, 1);
  expect((await editState(page)).selected).toEqual([0, 1, 2]);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t13-wall-selection.png` });

  // Second drag beginning on a selected tile deselects the swept tiles.
  await forceHover(page, 0);
  await page.mouse.down();
  await pump(page, 1);
  await forceHover(page, 1);
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);
  expect((await editState(page)).selected).toEqual([2]);
});

test("reset restores the piece's baseline selection", async ({ page }) => {
  await ready(page);
  await editWall(page);

  await forceHover(page, 4);
  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);
  expect((await editState(page)).selected).toEqual([4]);

  await page.keyboard.press("KeyT"); // resetEdit
  await pump(page, 2);
  expect((await editState(page)).selected).toEqual([]); // back to baseline (full)
});

test("confirm exits edit mode; walking away cancels cleanly", async ({ page }) => {
  await ready(page);
  await editWall(page);
  expect((await editState(page)).editing).toBe(true);

  // Toggle mode (confirmEditOnRelease defaults off): pressing edit again confirms.
  await page.keyboard.press("KeyG");
  await pump(page, 2);
  expect((await editState(page)).editing).toBe(false);

  // Re-enter, then walk out of reach: the edit cancels.
  await page.keyboard.press("KeyG");
  await pump(page, 2);
  expect((await editState(page)).editing).toBe(true);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.teleport(60, 0, 60));
  await pump(page, 2);
  expect((await editState(page)).editing).toBe(false);
});

test("edit works on every piece type with the right tile counts", async ({ page }) => {
  await ready(page);
  // Each piece gets its own cell so the raycast never hits an earlier one.
  // Floors are thin, so aim steeply down from on top; stairs/roofs rise to the
  // cell height, so aim at them like a wall from the front.
  // Player standoff is given in cell units (multiples of CELL_SIZE) so the aim
  // geometry stays proportional to the piece under any grid scale.
  const cases: Array<[string, number, number, number, number]> = [
    // kind, tiles, cz, playerZcells, pitch
    ["floor", 4, 2, 2.5, -1.25],
    ["stairs", 4, 5, 6.5, -0.35],
    ["roof", 4, 8, 9.5, -0.35],
  ];
  for (const [kind, tiles, cz, zCells, pitch] of cases) {
    await page.evaluate(
      (a) => {
        const f = (window as unknown as FortWin).__fort;
        f.debug.teleport(0.5 * a.cell, 0, a.zCells * a.cell);
        f.debug.setYaw(0);
        f.debug.setPitch(a.pitch);
        f.debug.build[a.kind](0, 0, a.cz);
        f.debug.pump(2);
      },
      { kind, cz, zCells, pitch, cell: CELL_SIZE },
    );
    await page.keyboard.press("KeyG");
    await pump(page, 2);
    const s = await editState(page);
    expect(s.editing, kind).toBe(true);
    expect(s.type, kind).toBe(kind);
    // Select the last tile to prove all `tiles` are addressable.
    await forceHover(page, tiles - 1);
    await page.mouse.down();
    await pump(page, 1);
    await page.mouse.up();
    await pump(page, 1);
    expect((await editState(page)).selected, kind).toEqual([tiles - 1]);
    // Exit before the next case.
    await page.keyboard.press("KeyG");
    await pump(page, 2);
  }
});
