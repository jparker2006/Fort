import * as THREE from "three";

// Procedural, in-repo textures. No external image files. A small seeded PRNG
// keeps generation deterministic so screenshots are stable across runs.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/**
 * Original stylized grass texture: a stippled two-tone green with faint blade
 * strokes. Tiles seamlessly so it can repeat across the island.
 */
export function makeGrassTexture(size = 256): THREE.Texture {
  const { canvas, ctx } = makeCanvas(size);
  const rand = mulberry32(0x6f72_7401);

  // Base fill.
  ctx.fillStyle = "#3f7a3a";
  ctx.fillRect(0, 0, size, size);

  // Speckle two darker and one lighter tone for depth.
  const tones = ["#356b31", "#2e5f2b", "#4b8c43"];
  for (let i = 0; i < size * size * 0.12; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)]!;
    const r = rand() * 1.6 + 0.4;
    ctx.fillRect(x, y, r, r);
  }

  // Faint blade strokes for a hand-drawn feel; wrap around edges for tiling.
  ctx.strokeStyle = "rgba(70, 130, 60, 0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = rand() * 5 + 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y - len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
