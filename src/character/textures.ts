import * as THREE from "three";

// Procedural fabric-weave texture for the hero outfit. Combined with per-vertex
// color blocking so one small tiling texture dresses the whole character. No
// external image files.

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

export function makeFabricTexture(size = 128): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const rand = mulberry32(0x2c10_77aa);

  // Neutral mid-gray base so vertex colors carry the hue; the weave adds a
  // subtle light/dark cross-hatch for material texture.
  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(0, 0, size, size);

  const step = 4;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const warp = (x / step + y / step) % 2 === 0;
      const j = (rand() - 0.5) * 18;
      const base = warp ? 168 : 150;
      const v = Math.max(120, Math.min(200, base + j));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, step, step);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
