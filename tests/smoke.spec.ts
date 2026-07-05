import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test("loads in a real browser with a WebGL canvas and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __fortReady?: boolean }).__fortReady === true);

  const canvas = page.locator("canvas.fort-canvas");
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  await page.screenshot({ path: `${EVIDENCE_DIR}/t01-smoke.png` });

  expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
});
