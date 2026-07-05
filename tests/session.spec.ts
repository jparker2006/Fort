import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean; __lock?: number; __fs?: number };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

const pump = (page: import("@playwright/test").Page, n: number) =>
  page.evaluate((k) => (window as unknown as FortWin).__fort.debug.pump(k), n);
const state = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.state());
const inputOn = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.inputEnabled());

async function boot(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
}

// Standard "playing" entry: clicking the title overlay starts the session.
async function play(page: import("@playwright/test").Page) {
  await boot(page);
  await page.mouse.click(400, 300);
  await pump(page, 2);
}

test("boot shows the title with the sim frozen and input off; Play starts it", async ({ page }) => {
  await boot(page);
  await expect(page.locator("#title")).toBeVisible();
  expect(await state(page)).toBe("title");
  expect(await inputOn(page)).toBe(false);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t18-title.png` });

  await page.locator("#title-play").click();
  await pump(page, 1);
  expect(await state(page)).toBe("playing");
  expect(await inputOn(page)).toBe(true);
  await expect(page.locator("#title")).toBeHidden();
});

test("Play requests pointer lock and fullscreen from the one gesture", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const w = window as unknown as FortWin;
    w.__lock = 0;
    w.__fs = 0;
    const el = document.getElementById("app")! as any;
    el.requestPointerLock = () => {
      w.__lock = (w.__lock ?? 0) + 1;
      return Promise.resolve();
    };
    el.requestFullscreen = () => {
      w.__fs = (w.__fs ?? 0) + 1;
      return Promise.resolve();
    };
  });
  await page.locator("#title-play").click();
  expect(await page.evaluate(() => (window as unknown as FortWin).__lock)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fs)).toBe(1);
});

test("pausing freezes the sim; resuming continues without a held-key ghost", async ({ page }) => {
  await play(page);

  // Suspend the player in the air and pause atomically: while paused, 60 frames
  // of gravity must not advance the fall (unfrozen it would drop to the ground).
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 10, 0);
    f.debug.session.pause();
  });
  expect(await state(page)).toBe("paused");
  expect(await inputOn(page)).toBe(false);
  await pump(page, 60);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y)).toBeGreaterThan(9.5);

  // Resume: gravity resumes.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.resume());
  expect(await state(page)).toBe("playing");
  await pump(page, 60);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.playerPos().y)).toBeLessThan(2);

  // A key held across a pause does not ghost-drive movement after resume.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(0, 0, 0);
    f.debug.setYaw(0);
  });
  await page.keyboard.down("KeyW");
  await pump(page, 15);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.pause());
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.resume());
  await pump(page, 30);
  const v = await page.evaluate(() => {
    const s = (window as unknown as FortWin).__fort.player.state;
    return Math.hypot(s.velocity.x, s.velocity.z);
  });
  await page.keyboard.up("KeyW");
  expect(v).toBeLessThan(0.1); // stopped; the released key does not keep driving
});

test("rapid pause/resume cycling 20 times leaves a consistent state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await play(page);
  await page.evaluate(() => {
    const s = (window as unknown as FortWin).__fort.debug.session;
    for (let i = 0; i < 20; i++) {
      s.pause();
      s.resume();
    }
  });
  expect(await state(page)).toBe("playing");
  expect(await inputOn(page)).toBe(true);
  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("pausing mid-edit cancels the edit safely", async ({ page }) => {
  await play(page);
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.teleport(2, 0, 10);
    f.debug.setYaw(0);
    f.debug.setPitch(-0.35);
    f.debug.build.wall(0, 0, 2, "S");
    f.debug.pump(2);
  });
  await page.keyboard.press("KeyG");
  await pump(page, 2);
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.edit.isEditing())).toBe(true);

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.session.pause());
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.debug.edit.isEditing())).toBe(false);
});
