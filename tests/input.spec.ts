import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

type FortWin = {
  __fort?: {
    input: {
      isDown: (a: string) => boolean;
      bindings: { get: (a: string) => string };
      rebind: (a: string, code: string, r?: string) => { ok: boolean; conflictWith?: string };
    };
  };
  __fortReady?: boolean;
};

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

// Each Playwright test runs in an isolated browser context, so localStorage
// starts empty per test; no manual clearing needed.

test("keyboard drives action state live through the action map", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);

  await page.mouse.click(400, 300); // focus the page

  await page.keyboard.down("KeyW");
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort!.input.isDown("moveForward"))).toBe(true);
  await page.keyboard.up("KeyW");
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort!.input.isDown("moveForward"))).toBe(false);

  // A build piece bind.
  await page.keyboard.down("KeyZ");
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort!.input.isDown("buildWall"))).toBe(true);
  await page.keyboard.up("KeyZ");
});

test("debug input overlay lists actions and reflects live state", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  await page.mouse.click(400, 300); // start the session so input is live

  const overlay = page.locator("#debug-input-overlay");
  await page.keyboard.press("Backslash");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Move Forward");
  await expect(overlay).toContainText("Build Wall");

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t04-input-overlay.png` });
  // The down marker appears somewhere in the overlay while W is held.
  await expect(overlay).toContainText("[*]");
  await page.keyboard.up("KeyW");
});

test("rebinding takes effect immediately and persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);

  // Rebind jump from Space to KeyJ.
  const res = await page.evaluate(() =>
    (window as unknown as FortWin).__fort!.input.rebind("jump", "KeyJ"),
  );
  expect(res.ok).toBe(true);

  await page.mouse.click(400, 300);
  await page.keyboard.down("KeyJ");
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort!.input.isDown("jump"))).toBe(true);
  await page.keyboard.up("KeyJ");

  // Reload: the new bind must survive via localStorage.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  const bind = await page.evaluate(() => (window as unknown as FortWin).__fort!.input.bindings.get("jump"));
  expect(bind).toBe("KeyJ");
});

test("conflict detection rejects a duplicate bind", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);

  const res = await page.evaluate(() =>
    (window as unknown as FortWin).__fort!.input.rebind("moveForward", "KeyS"),
  );
  expect(res.ok).toBe(false);
  expect(res.conflictWith).toBe("moveBack");
});
