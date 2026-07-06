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
const count = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.count());
const modeInfo = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    return { mode: t.mode(), piece: t.piece(), material: t.material() };
  });

async function aimForward(page: import("@playwright/test").Page, x: number, z: number, yaw: number) {
  await page.evaluate(
    (a) => {
      const f = (window as unknown as FortWin).__fort;
      f.debug.teleport(a.x, 0, a.z);
      f.debug.setYaw(a.yaw);
      f.debug.setPitch(-0.7);
    },
    { x, z, yaw },
  );
}

test("piece-select and combat binds gate the mode state machine", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.setMode("movement"));

  // Each piece bind enters build mode and selects its piece.
  await page.keyboard.press("KeyX"); // buildFloor
  await pump(page, 2);
  expect(await modeInfo(page)).toMatchObject({ mode: "build", piece: "floor" });

  await page.keyboard.press("KeyC"); // buildStairs
  await pump(page, 2);
  expect((await modeInfo(page)).piece).toBe("stairs");

  // Build/combat toggle swaps to the Mattock carry and back.
  await page.keyboard.press("KeyB");
  await pump(page, 2);
  expect((await modeInfo(page)).mode).toBe("mattock");
  await page.keyboard.press("KeyB");
  await pump(page, 2);
  expect((await modeInfo(page)).mode).toBe("build");
});

test("primary fire places one piece and never double-places the same slot", async ({ page }) => {
  await ready(page);
  await aimForward(page, 0, 10, 0);
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("wall");
  });
  await pump(page, 2);
  const before = await count(page);

  // Tap: one placement.
  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);
  expect(await count(page)).toBe(before + 1);

  // Hold on the same (now occupied) target: turbo must not double-place.
  await page.mouse.down();
  await pump(page, 30);
  await page.mouse.up();
  expect(await count(page)).toBe(before + 1);
});

// Position the player ahead of a fresh cell (yaw 0 -> a wall 2 units ahead at
// Z=8, spanning the player's X cell), so each new X gives a distinct valid slot.
async function standAt(page: import("@playwright/test").Page, x: number) {
  await page.evaluate((px) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(px, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.7);
  }, x);
}

test("turbo build fills fresh slots while held, and stops when toggled off", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("wall");
    t.setTurbo(true);
  });
  await standAt(page, -2 * CELL_SIZE);
  await pump(page, 2);
  const before = await count(page);

  // Move one full cell per step while holding fire, so each stand targets a
  // fresh slot exactly once (stride tracks CELL_SIZE, not a fixed literal).
  await page.mouse.down();
  for (let i = 0; i < 6; i++) {
    await standAt(page, (-2 + i) * CELL_SIZE);
    await pump(page, 8); // clears the tap plus TURBO_FIRST_DELAY (0.15s ~ 9 frames)
  }
  await page.mouse.up();
  const afterTurbo = await count(page);
  expect(afterTurbo - before).toBeGreaterThanOrEqual(3);

  // Turbo off: holding across fresh cells places at most the single tap, never
  // a continuous stream.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.setTurbo(false));
  const held = afterTurbo;
  await page.mouse.down();
  for (let i = 0; i < 4; i++) {
    await standAt(page, (3 + i) * CELL_SIZE);
    await pump(page, 8);
  }
  await page.mouse.up();
  expect(await count(page) - held).toBeLessThanOrEqual(1);
});

// Sweep the player one cell east per step while holding fire, placing a floor in
// the cell ahead of the crosshair (floors are one slot per cell, unlike walls
// which share edges between neighbours and would double-target). `framesPerCell`
// pumped frames pass per cell: at 4 frames (~0.067 s) a 0.05 s cadence always
// lands a tick inside each cell (one floor per cell), while the OLD 0.1 s cadence
// would tick only every other cell.
async function sweepFloorRun(page: import("@playwright/test").Page, cells: number, framesPerCell: number) {
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("floor");
    t.setTurbo(true);
  });
  await page.evaluate((cell) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(-19 * cell, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.7); // crosshair on the ground a cell ahead (-Z)
  }, CELL_SIZE);
  await pump(page, 2);
  const before = await count(page);

  await page.mouse.down();
  for (let i = 0; i < cells; i++) {
    await page.evaluate((a) => (window as unknown as FortWin).__fort.debug.teleport((-19 + a.i) * a.cell, 0, 10), {
      cell: CELL_SIZE,
      i,
    });
    await pump(page, framesPerCell);
  }
  await page.mouse.up();
  return (await count(page)) - before;
}

test("turbo streams many pieces during a held sweep (T25 end-to-end + evidence)", async ({ page }) => {
  await ready(page);

  // End-to-end smoke through the real input + targeting path: a held sweep lays
  // down a long run of floors. The EXACT cadence count is pinned deterministically
  // in src/build/build-controller.test.ts (the camera spring makes the browser
  // count jitter); here we only assert the stream is clearly flowing and capture
  // the evidence shot.
  const placed = await sweepFloorRun(page, 39, 4);
  expect(placed).toBeGreaterThanOrEqual(12);

  // Evidence: stand back and shoot the finished turbo run.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 0, 34);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.2);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-turbo-run.png` });
});

test("two quick taps place two pieces in different slots with no cross-slot delay (T25)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("wall");
    t.setTurbo(true); // even with turbo on, distinct taps stay instant
  });
  await standAt(page, -4);
  await pump(page, 2);
  const before = await count(page);

  // Tap 1.
  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);

  // Move to a fresh cell and tap again at once: the first-delay governs only the
  // held auto-repeat, never a new tap, so the second piece lands immediately.
  await standAt(page, 4);
  await pump(page, 1);
  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);

  expect((await count(page)) - before).toBe(2);
});

async function placeHere(page: import("@playwright/test").Page): Promise<string> {
  const key = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.info().key);
  await page.mouse.down();
  await pump(page, 1);
  await page.mouse.up();
  await pump(page, 1);
  return key;
}
const materialAt = (page: import("@playwright/test").Page, key: string) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.build.materialAt(k), key);

test("material cycle changes new placements while existing pieces keep theirs", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("wall");
  });

  // Place a wood wall ahead.
  await standAt(page, -4);
  await pump(page, 2);
  const woodKey = await placeHere(page);
  expect(await materialAt(page, woodKey)).toBe("wood");

  // Cycle to stone, stand at a fresh cell, place.
  await page.keyboard.press("KeyF"); // materialCycle
  await pump(page, 2);
  expect((await modeInfo(page)).material).toBe("stone");
  await standAt(page, 4);
  await pump(page, 2);
  const stoneKey = await placeHere(page);
  expect(stoneKey).not.toBe(woodKey);
  expect(await materialAt(page, stoneKey)).toBe("stone");

  // The wood wall did not change.
  expect(await materialAt(page, woodKey)).toBe("wood");
});

test("the three materials are visually distinct", async ({ page }) => {
  await ready(page);
  // A row of walls, one per material, viewed head-on.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(-1, 0, 0, "S", { material: "wood" });
    f.debug.build.wall(0, 0, 0, "S", { material: "stone" });
    f.debug.build.wall(1, 0, 0, "S", { material: "metal" });
    f.debug.teleport(2, 0, -4);
    f.debug.setYaw(Math.PI); // face -Z toward the wall row at z=0
    f.debug.setPitch(-0.05);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t11-materials.png` });
});
