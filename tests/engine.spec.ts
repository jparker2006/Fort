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

test("simulation advances over time (loop is running)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady);

  const draws = await page.evaluate(() => {
    const g = (window as unknown as { __fort?: { game: { renderer: { info: { render: { frame: number } } } } } }).__fort;
    return g?.game.renderer.info.render.frame ?? 0;
  });
  await page.waitForTimeout(300);
  const draws2 = await page.evaluate(() => {
    const g = (window as unknown as { __fort?: { game: { renderer: { info: { render: { frame: number } } } } } }).__fort;
    return g?.game.renderer.info.render.frame ?? 0;
  });
  expect(draws2).toBeGreaterThan(draws);
});
