import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

// A 1080p viewport so the full rebind list fits without the settings body
// scrolling (which can transiently intercept a bind-button click under load).
test.use({ viewport: { width: 1920, height: 1080 } });

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));
}

const pump = (page: import("@playwright/test").Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);
const bindOf = (page: import("@playwright/test").Page, action: string) =>
  page.evaluate((a) => (window as unknown as FortWin).__fort.input.bindings.get(a), action);

test("Escape opens the settings menu and lists every action", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Escape");
  await pump(page, 1);
  await expect(page.locator("#settings")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.isOpen())).toBe(true);

  // Every action from T04 has a rebind row (19 actions).
  await expect(page.locator(".bind-key")).toHaveCount(19);
  for (const a of ["buildWall", "buildFloor", "buildStairs", "buildRoof", "edit", "resetEdit", "rotate", "materialCycle", "destroyPickaxe", "buildCombatToggle"]) {
    await expect(page.locator(`.bind-key[data-action="${a}"]`)).toHaveCount(1);
  }
  await page.screenshot({ path: `${EVIDENCE_DIR}/t17-settings-input.png` });
});

test("rebinding a piece key persists across reload and updates the HUD label", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.open());
  await pump(page, 1);

  // Click the wall bind, press a fresh key.
  await page.locator('.bind-key[data-action="buildWall"]').click();
  await page.keyboard.press("KeyN");
  await pump(page, 1);
  await expect(page.locator('.bind-key[data-action="buildWall"]')).toHaveText("N");
  expect(await bindOf(page, "buildWall")).toBe("KeyN");

  // Reload: the bind persists and the HUD tray reflects it.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await pump(page, 2);
  expect(await bindOf(page, "buildWall")).toBe("KeyN");
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.hud.trayLabel("wall"))).toBe("N");
});

test("binding a key already in use triggers the conflict swap flow", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.open());
  await pump(page, 1);

  // buildFloor defaults to KeyX; rebinding buildWall to X should conflict.
  await page.locator('.bind-key[data-action="buildWall"]').click();
  await page.keyboard.press("KeyX");
  await pump(page, 1);
  await expect(page.locator("#bind-conflict")).toBeVisible();

  await page.locator("#conflict-swap").click();
  await pump(page, 1);
  // Wall took X; floor took wall's old key (Z).
  expect(await bindOf(page, "buildWall")).toBe("KeyX");
  expect(await bindOf(page, "buildFloor")).toBe("KeyZ");
});

test("sensitivity and gameplay changes apply live and persist", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.open());
  await pump(page, 1);

  // FOV slider (on the Sensitivity tab) applies immediately to the camera.
  await page.locator('.settings-tabs button[data-tab="sensitivity"]').click();
  await page.locator('input[data-setting="fov"]').fill("105");
  await page.locator('input[data-setting="fov"]').dispatchEvent("input");
  await pump(page, 2);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.fov())).toBe(105);

  // Gameplay tab: turn turbo build off.
  await page.locator('.settings-tabs button[data-tab="gameplay"]').click();
  await page.locator('input[data-gameplay="turboBuild"]').uncheck();
  await pump(page, 1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.gameplay().turboBuild)).toBe(false);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t17-settings-gameplay.png` });

  // Reload: both survive.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await pump(page, 2);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.fov())).toBe(105);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.gameplay().turboBuild)).toBe(false);
});

test("clearing storage restores documented defaults", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.settings.open());
  await pump(page, 1);
  await page.locator('.bind-key[data-action="buildWall"]').click();
  await page.keyboard.press("KeyM");
  await pump(page, 1);
  expect(await bindOf(page, "buildWall")).toBe("KeyM");

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300);
  await pump(page, 2);
  expect(await bindOf(page, "buildWall")).toBe("KeyZ"); // documented default
});
