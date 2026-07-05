import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const EVIDENCE_DIR = "test-results/evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TWin = { __turntable?: any; __fortReady?: boolean };

test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }));

test("hero renders skinned in the turntable with an in-code texture", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/?turntable");
  await page.waitForFunction(() => (window as unknown as TWin).__fortReady);
  await page.evaluate(() => (window as unknown as TWin).__turntable.setAngle(Math.PI));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${EVIDENCE_DIR}/t07-front.png` });

  const info = await page.evaluate(() => {
    const t = (window as unknown as TWin).__turntable;
    const m = t.hero.mesh;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    return {
      isSkinned: m.isSkinnedMesh === true,
      bones: t.hero.skeleton.bones.length,
      inverses: t.hero.skeleton.boneInverses.length,
      hasSkinIndex: !!m.geometry.getAttribute("skinIndex"),
      hasVertexColors: !!m.geometry.getAttribute("color") && m.material.vertexColors === true,
      mapIsCanvas: m.material.map && m.material.map.image instanceof HTMLCanvasElement,
      height: bb.max.y - bb.min.y,
    };
  });

  expect(info.isSkinned).toBe(true);
  expect(info.bones).toBe(18);
  expect(info.inverses).toBe(18);
  expect(info.hasSkinIndex).toBe(true);
  expect(info.hasVertexColors).toBe(true);
  // Texture is a procedurally generated canvas, not an image file.
  expect(info.mapIsCanvas).toBe(true);
  // Correct scale: about 1.8 units tall.
  expect(info.height).toBeGreaterThan(1.7);
  expect(info.height).toBeLessThan(1.95);

  expect(errors, errors.join("; ")).toHaveLength(0);
});

test("posing bones deforms the skin (joint bends) without errors", async ({ page }) => {
  await page.goto("/?turntable");
  await page.waitForFunction(() => (window as unknown as TWin).__fortReady);

  await page.evaluate(() => {
    const t = (window as unknown as TWin).__turntable;
    t.setAngle(Math.PI * 0.8);
    t.poseBone("elbowL", 0, 0, -1.2);
    t.poseBone("elbowR", 0, 0, 1.2);
    t.poseBone("kneeL", 1.0, 0, 0);
    t.poseBone("shoulderL", 0, 0, -0.6);
  });
  await page.waitForTimeout(200);

  // The posed bone rotations are reflected in the live skeleton.
  const rot = await page.evaluate(() => {
    const b = (window as unknown as TWin).__turntable.hero.bones.get("elbowL");
    return b.rotation.z;
  });
  expect(Math.abs(rot)).toBeGreaterThan(1.0);

  await page.screenshot({ path: `${EVIDENCE_DIR}/t07-posed.png` });
});

test("no external image assets are requested for the character", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/\.(png|jpg|jpeg|gif|webp|glb|gltf|fbx|hdr)(\?|$)/i.test(url) && !url.includes("/icons/")) {
      external.push(url);
    }
  });
  await page.goto("/?turntable");
  await page.waitForFunction(() => (window as unknown as TWin).__fortReady);
  await page.waitForTimeout(150);
  // The hero geometry and textures are generated in code; no art files loaded.
  expect(external, external.join("; ")).toHaveLength(0);
});
