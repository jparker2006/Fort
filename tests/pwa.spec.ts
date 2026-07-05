import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
}

test("serves a valid manifest linked from the document", async ({ page }) => {
  await ready(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const manifest = await page.evaluate(async () => {
    const res = await fetch("/manifest.webmanifest");
    return res.json();
  });
  expect(manifest.name).toBe("Fort");
  expect(manifest.display).toBe("fullscreen");
  expect(manifest.orientation).toBe("landscape");
  // Original icon set including maskable variants at 192 and 512.
  const sizes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toContain("512x512:any");
  expect(sizes).toContain("512x512:maskable");
});

test("registers a service worker that precaches the app shell", async ({ page }) => {
  await ready(page);
  // The registration lands and activates.
  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(active).toBe(true);

  // Exactly one version cache exists, holding the shell (so an old build's cache
  // would have been dropped on activate).
  const caches = await page.evaluate(async () => {
    const keys = await (self as any).caches.keys();
    const c = await (self as any).caches.open(keys[0]);
    const shell = await c.match("/index.html");
    return { count: keys.length, key: keys[0], hasShell: !!shell };
  });
  expect(caches.count).toBe(1);
  expect(caches.key).toContain("fort-");
  expect(caches.hasShell).toBe(true);
});

test("boots fully offline after one successful load", async ({ page, context }) => {
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Start the session once so the run is a real play session before going dark.
  await page.mouse.click(400, 300);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(2));

  // Kill the network and reload: the service worker serves the cached shell.
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fortReady)).toBe(true);

  // The game is interactive offline: place a piece via a started session.
  await page.mouse.click(400, 300);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.build.wall(0, 0, 2, "S");
    f.debug.pump(2);
  });
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.build.count())).toBe(1);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t19-offline.png` });

  await context.setOffline(false);
});
