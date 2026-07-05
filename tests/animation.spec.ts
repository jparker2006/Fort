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
const animState = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as FortWin).__fort.debug.animState());

test("locomotion state transitions idle to run to sprint without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);

  expect(await animState(page)).toBe("idle");

  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.setYaw(0));
  await page.keyboard.down("KeyW");
  await pump(page, 20);
  expect(await animState(page)).toBe("run");

  await page.keyboard.down("ShiftLeft");
  await pump(page, 20);
  expect(await animState(page)).toBe("sprint");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t08-run.png` });

  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await pump(page, 40);
  expect(await animState(page)).toBe("idle");

  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("jump enters the airborne state from the ground", async ({ page }) => {
  await ready(page);
  await page.keyboard.down("Space");
  await pump(page, 6);
  expect(await animState(page)).toBe("jump");
  await page.keyboard.up("Space");
  // Falls back to a grounded state after landing.
  await pump(page, 120);
  const s = await animState(page);
  expect(["idle", "run"]).toContain(s);
});

test("crouch enters crouch idle and crouch walk", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.setYaw(0));

  await page.keyboard.down("ControlLeft");
  await pump(page, 10);
  expect(await animState(page)).toBe("crouchIdle");
  await page.screenshot({ path: `${EVIDENCE_DIR}/t08-crouch.png` });

  await page.keyboard.down("KeyW");
  await pump(page, 15);
  expect(await animState(page)).toBe("crouchWalk");

  await page.keyboard.up("KeyW");
  await page.keyboard.up("ControlLeft");
});

test("build swing overlays on running without freezing the legs", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.setYaw(0));
  await page.keyboard.down("KeyW");
  await pump(page, 20);

  // Trigger the swing; the locomotion state must stay "run" (legs keep going).
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.buildSwing());
  const legSamples = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    const rots: number[] = [];
    for (let i = 0; i < 10; i++) {
      f.debug.pump(1);
      rots.push(f.debug.boneRotX("hipL"));
    }
    return { rots, state: f.debug.animState() };
  });
  await page.keyboard.up("KeyW");

  expect(legSamples.state).toBe("run");
  // The leg bone kept moving during the swing (not frozen).
  const spread = Math.max(...legSamples.rots) - Math.min(...legSamples.rots);
  expect(spread).toBeGreaterThan(0.1);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t08-buildswing.png` });
});

test("aim mode faces the camera; free mode faces the movement direction", async ({ page }) => {
  await ready(page);

  // Aim mode: body turns to the camera yaw.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setAimMode(true);
    f.debug.setYaw(1.0);
    f.debug.pump(40);
  });
  const aimYaw = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.bodyYaw());
  expect(Math.abs(aimYaw - 1.0)).toBeLessThan(0.1);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t08-aimface.png` });

  // Free mode: running with camera yaw 0 (forward -Z), body faces movement (yaw 0).
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setAimMode(false);
    f.debug.setYaw(0);
  });
  await page.keyboard.down("KeyW");
  await pump(page, 60);
  await page.keyboard.up("KeyW");
  const moveYaw = await page.evaluate(() => (window as unknown as FortWin).__fort.debug.bodyYaw());
  expect(Math.abs(moveYaw)).toBeLessThan(0.15);
});
