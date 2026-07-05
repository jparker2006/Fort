import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FortWin = { __fort?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as FortWin).__fortReady);
  // Pump a few deterministic frames so the rig has run.
  await page.evaluate(() => (window as unknown as FortWin).__fort.debug.pump(5));
}

test("aim ray, crosshair, and world hit agree at screen center", async ({ page }) => {
  await ready(page);

  // The aim ray's ground hit, reprojected through the camera, lands at screen
  // center (NDC ~ 0,0). This proves the crosshair and aim ray are the same ray.
  const ndc = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    const hit = f.debug.aimGroundHit();
    if (!hit) return null;
    const v = f.game.camera.position.clone().set(hit.x, 0, hit.z);
    v.project(f.game.camera);
    return { x: v.x, y: v.y };
  });
  expect(ndc).not.toBeNull();
  expect(Math.abs(ndc!.x)).toBeLessThan(0.02);
  expect(Math.abs(ndc!.y)).toBeLessThan(0.02);
});

test("camera is behind and to the right of the player (over the shoulder)", async ({ page }) => {
  await ready(page);
  const info = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    const cam = f.game.camera.position;
    return { camX: cam.x, camZ: cam.z, camY: cam.y, dist: f.cameraRig.distanceToPivot() };
  });
  // Default yaw 0 looks toward -Z, so the camera sits at +Z behind the player,
  // shifted to +X (right shoulder), at roughly the boom distance.
  expect(info.camZ).toBeGreaterThan(1.5);
  expect(info.camX).toBeGreaterThan(0);
  expect(info.dist).toBeGreaterThan(3.0);
  expect(info.dist).toBeLessThan(3.6);
});

test("spring arm pulls the camera in when a wall is behind the player", async ({ page }) => {
  await ready(page);
  // Put the player at the origin so a box at +Z sits between the pivot and the
  // camera (yaw 0 places the camera behind the player at +Z).
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.setYaw(0);
    f.debug.teleport(0, 0, 0);
    f.debug.pump(3);
  });
  const before = await page.evaluate(() => (window as unknown as FortWin).__fort.cameraRig.distanceToPivot());

  // Place a wall directly behind the player, between the pivot and the camera.
  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.debug.placeBox(0.4, 1.6, 1.6, 4, 3, 0.3);
    f.debug.pump(3);
  });
  const after = await page.evaluate(() => (window as unknown as FortWin).__fort.cameraRig.distanceToPivot());

  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(0.5); // did not collapse through the head
  await page.screenshot({ path: `${EVIDENCE_DIR}/t05-springarm.png` });
});

test("FOV applies live and clamps to range", async ({ page }) => {
  await ready(page);

  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.input.updateSettings({ fov: 110 });
    f.debug.pump(2);
  });
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.game.camera.fov)).toBe(110);

  await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    f.input.updateSettings({ fov: 500 });
    f.debug.pump(2);
  });
  expect(await page.evaluate(() => (window as unknown as FortWin).__fort.game.camera.fov)).toBe(120);
});

test("crouch lowers the camera height smoothly", async ({ page }) => {
  await ready(page);
  const standY = await page.evaluate(() => (window as unknown as FortWin).__fort.game.camera.position.y);

  // Hold crouch and pump enough frames for the blend to settle.
  await page.mouse.click(400, 300);
  await page.keyboard.down("ControlLeft");
  const samples = await page.evaluate(() => {
    const f = (window as unknown as FortWin).__fort;
    const ys: number[] = [];
    for (let i = 0; i < 30; i++) {
      f.debug.pump(1);
      ys.push(f.game.camera.position.y);
    }
    return ys;
  });
  await page.keyboard.up("ControlLeft");

  const crouchY = samples[samples.length - 1]!;
  expect(crouchY).toBeLessThan(standY);
  // Monotonic, non-jumpy descent: no single step drops more than a small amount.
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(samples[i]! - samples[i - 1]!));
  }
  expect(maxStep).toBeLessThan(0.15);
});

test("invert Y flips vertical look direction", async ({ page }) => {
  await ready(page);

  const pitchAfterMouse = async (invert: boolean) => {
    await page.evaluate((inv) => {
      const f = (window as unknown as FortWin).__fort;
      f.input.updateSettings({ invertY: inv });
      f.cameraRig.pitch = 0;
    }, invert);
    await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: 100 }));
      (window as unknown as FortWin).__fort.debug.pump(1);
    });
    return page.evaluate(() => (window as unknown as FortWin).__fort.cameraRig.pitch);
  };

  const normal = await pitchAfterMouse(false);
  const inverted = await pitchAfterMouse(true);
  expect(normal).not.toBe(0);
  expect(Math.sign(normal)).not.toBe(Math.sign(inverted));
});
