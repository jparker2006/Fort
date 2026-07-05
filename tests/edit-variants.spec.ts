import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CELL_SIZE, CELL_HEIGHT } from "../src/world/grid.ts";

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
const posY = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y);
const posZ = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().z);

// Door variant: remove the bottom-center column (tiles 1,4) -> solid mask.
const DOOR = `wall#${0x1ff & ~((1 << 1) | (1 << 4))}`;
const LOW_WALL = "wall#7"; // bottom row only
const FLOOR_HOLE = `floor#${0xf & ~1}`; // remove corner quarter (tile 0)

test("collision matches the door edit: the player walks through the opening", async ({ page }) => {
  await ready(page);
  await page.evaluate((v) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(0, 0, 2, "S"); // wall at Z=8, spans X 0..4
    f.debug.build.applyEdit("wz:2:0:0", v);
    f.debug.teleport(2, 0, 10); // centered on the door column
    f.debug.setYaw(0); // forward = -Z, toward the wall
  }, DOOR);
  await page.keyboard.down("KeyW");
  await pump(page, 70);
  await page.keyboard.up("KeyW");
  expect(await posZ(page)).toBeLessThan(7); // passed through to the far side
});

test("collision matches a floor hole: the player over it falls", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(0, 0, 0, "W");
    f.debug.build.floor(0, 1, 0, { material: "wood" });
    f.debug.teleport(1, 3.4, 1); // over the corner quarter (x0..2, z0..2)
    f.debug.pump(6);
  });
  expect(await posY(page)).toBeGreaterThan(2.5); // resting on the floor

  await page.evaluate((v) => (window as unknown as FortWin).__fort.debug.build.applyEdit("f:0:1:0", v), FLOOR_HOLE);
  await pump(page, 60);
  expect(await posY(page)).toBeLessThan(1); // fell through the hole
});

test("collision matches a low wall edit: its top sits one third up", async ({ page }) => {
  await ready(page);
  await page.evaluate((a) => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(0, 0, 2, "S");
    f.debug.build.applyEdit("wz:2:0:0", a.v);
    // Drop onto the low wall top: over the cell mid-X, at the wall's south edge
    // (cell 2 boundary), from just above the H/3 low-wall top.
    f.debug.teleport(a.cell / 2, a.h / 3 + 0.5, 2 * a.cell);
  }, { v: LOW_WALL, cell: CELL_SIZE, h: CELL_HEIGHT });
  await pump(page, 25);
  const y = await posY(page);
  expect(y).toBeGreaterThan(CELL_HEIGHT / 3 - 0.1);
  expect(y).toBeLessThan(CELL_HEIGHT / 3 + 0.15); // landed at H/3, not the full height
});

test("stairs re-face: the ramp becomes walkable from its new low edge", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.stairs(0, 0, 2, { rotation: 0 }); // ascends +Z
    f.debug.build.applyEdit("s:0:0:2", "stairs", 1); // re-face to ascend +X
    f.debug.teleport(-1, 0, 10); // approach the new low (-X) edge
    f.debug.setYaw(-Math.PI / 2); // forward = +X
  });
  await page.keyboard.down("KeyW");
  let peak = 0;
  for (let i = 0; i < 9; i++) {
    await pump(page, 6);
    peak = Math.max(peak, await posY(page));
  }
  await page.keyboard.up("KeyW");
  expect(peak).toBeGreaterThan(2); // climbed the re-faced ramp toward the top
});

test("canonical edit variants render (window, door, floor hole, re-faced stairs, half roof)", async ({ page }) => {
  await ready(page);

  // Window and door walls, plus a corner-hole floor, viewed together.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    const solid = 0x1ff;
    const WINDOW = `wall#${solid & ~(1 << 4)}`;
    const DOOR2 = `wall#${solid & ~((1 << 1) | (1 << 4))}`;
    f.debug.build.wall(-1, 0, 0, "S", { material: "stone" });
    f.debug.build.applyEdit("wz:0:-1:0", WINDOW);
    f.debug.build.wall(1, 0, 0, "S", { material: "wood" });
    f.debug.build.applyEdit("wz:0:1:0", DOOR2);
    f.debug.teleport(2, 0, -5);
    f.debug.setYaw(Math.PI); // face +Z toward the wall row
    f.debug.setPitch(-0.05);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t14-wall-window-door.png` });

  // Floor corner hole.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.floor(6, 0, 0, { material: "metal" });
    f.debug.build.applyEdit("f:6:0:0", `floor#${0xf & ~1}`);
    f.debug.teleport(26, 6, 2);
    f.debug.setYaw(Math.PI);
    f.debug.setPitch(-0.8);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t14-floor-hole.png` });

  // Re-faced stairs and a half roof, side by side.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.stairs(0, 0, 6, { material: "wood" });
    f.debug.build.applyEdit("s:0:0:6", "stairs", 1); // ascend +X
    f.debug.build.roof(3, 0, 6, { material: "stone" });
    f.debug.build.applyEdit("r:3:0:6", "roof#h", 0); // half roof sloping +Z
    f.debug.teleport(8, 0, 34);
    f.debug.setYaw(0); // face -Z toward the pieces at z24..28
    f.debug.setPitch(-0.15);
  });
  await pump(page, 3);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t14-stairs-roof.png` });
});
