import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

test("FPS overlay toggles with backquote and shows frame stats", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);

  const overlay = page.locator("#debug-overlay");
  await expect(overlay).toBeHidden();

  await page.keyboard.press("Backquote");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("fps");
  await expect(overlay).toContainText("frame");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t02-overlay.png` });

  await page.keyboard.press("Backquote");
  await expect(overlay).toBeHidden();
});

test("resize keeps the camera aspect matched to the canvas (no distortion)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);

  const aspectError = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas.fort-canvas") as HTMLCanvasElement;
      const g = (window as unknown as { __fort?: { game: { camera: { aspect: number } } } }).__fort;
      const canvasAspect = c.clientWidth / c.clientHeight;
      const camAspect = g!.game.camera.aspect;
      return Math.abs(canvasAspect - camAspect);
    });

  for (const size of [
    { width: 1000, height: 800 },
    { width: 1440, height: 600 },
    { width: 800, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(120);
    // Camera aspect must track the canvas so nothing is stretched.
    expect(await aspectError()).toBeLessThan(0.01);
  }
});

test("stepping the engine advances rendering and the sim", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);

  // Headless throttles requestAnimationFrame, so drive frames deterministically
  // through the engine's test step hook and confirm the render pipeline runs.
  type W = { __fort?: { game: { renderer: { info: { render: { frame: number } } } }; debug: { pump: (n: number) => void } } };
  const before = await page.evaluate(() => (window as unknown as W).__fort!.game.renderer.info.render.frame);
  await page.evaluate(() => (window as unknown as W).__fort!.debug.pump(10));
  const after = await page.evaluate(() => (window as unknown as W).__fort!.game.renderer.info.render.frame);
  expect(after).toBeGreaterThanOrEqual(before + 10);
});
