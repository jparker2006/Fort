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
  await standAt(page, -8);
  await pump(page, 2);
  const before = await count(page);

  // Move across cells while holding fire: each fresh slot fills once.
  await page.mouse.down();
  for (let i = 0; i < 6; i++) {
    await standAt(page, -8 + i * 4);
    await pump(page, 8); // > TURBO_INTERVAL (0.1s ~ 6 frames)
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
    await standAt(page, 12 + i * 4);
    await pump(page, 8);
  }
  await page.mouse.up();
  expect(await count(page) - held).toBeLessThanOrEqual(1);
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
