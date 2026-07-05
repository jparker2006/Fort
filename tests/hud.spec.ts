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

test("HUD shows the piece tray, material, and mode in build mode at 1080p", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as FortWin).__fort.debug.target;
    t.setMode("build");
    t.setPiece("stairs");
  });
  await pump(page, 2);

  // Tray exists with four slots; the active piece is highlighted.
  await expect(page.locator("#hud-tray .tray-slot")).toHaveCount(4);
  await expect(page.locator('.tray-slot[data-piece="stairs"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.mode())).toBe("build");
  // Material shows wood with an infinity glyph.
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.material())).toBe("wood");
  await expect(page.locator("#hud-material .mat-count")).toHaveText("∞");

  await page.screenshot({ path: `${EVIDENCE_DIR}/t15-hud-build.png` });
});

test("HUD switches crosshair and mode chip into edit mode", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    f.debug.build.wall(0, 0, 2, "S");
    f.debug.pump(2);
  });
  await page.keyboard.press("KeyG"); // enter edit
  await pump(page, 2);

  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.mode())).toBe("edit");
  await expect(page.locator("#hud-crosshair")).toHaveAttribute("data-mode", "edit");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t15-hud-edit.png` });
});

test("rebinding a piece key updates its tray label immediately", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.setMode("build"));
  await pump(page, 1);

  const before = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.trayLabel("wall"));
  expect(before).toBe("Z"); // default buildWall bind

  // Rebind wall to KeyP through the input system; the tray label follows.
  await page.evaluate(() => (window as unknown as FortWin).__fort.input.rebind("buildWall", "KeyP", "swap"));
  await pump(page, 1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.trayLabel("wall"))).toBe("P");
});

test("active material and mode indicators update within one frame", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.setMode("build"));
  await pump(page, 1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.material())).toBe("wood");

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.cycleMaterial());
  await pump(page, 1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.material())).toBe("stone");

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.target.setMode("mattock"));
  await pump(page, 1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.mode())).toBe("mattock");
});
