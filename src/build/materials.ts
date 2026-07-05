// Original procedural build materials: wood grain, brick-like stone, and
// riveted metal. Canvas-generated (no image files), so these only run in the
// browser; Node unit tests use the flat fallback in variants.ts instead. A
// seeded PRNG keeps the texture stable across runs for screenshot determinism.

import * as THREE from "three";
import type { Material } from "./piece.ts";

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

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { c, ctx };
}

function texture(c: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Vertical wood grain: warm browns with darker streaks and a few knots.
function woodTexture(size = 128): THREE.Texture {
  const { c, ctx } = canvas(size);
  const rand = mulberry32(0x7700_d1a1);
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 1) {
    const shade = 0.5 + 0.5 * Math.sin(x * 0.20 + Math.sin(x * 0.05) * 2);
    const v = Math.floor(70 + shade * 55);
    ctx.fillStyle = `rgb(${v + 40},${v},${Math.floor(v * 0.55)})`;
    ctx.fillRect(x, 0, 1, size);
  }
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < size * 3; i++) {
    ctx.fillStyle = rand() < 0.5 ? "#5a3a1c" : "#a5713f";
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, Math.floor(rand() * 6) + 1);
  }
  ctx.globalAlpha = 1;
  return texture(c);
}

// Brick-like stone: staggered blocks with mortar gaps, cool grays.
function stoneTexture(size = 128): THREE.Texture {
  const { c, ctx } = canvas(size);
  const rand = mulberry32(0x5107_e2b3);
  ctx.fillStyle = "#41474d"; // mortar
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const bh = size / rows;
  const bw = size / 4;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let x = -bw; x < size; x += bw) {
      const g = 120 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgb(${g},${g + 4},${g + 10})`;
      ctx.fillRect(x + offset + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < size * 4; i++) {
    ctx.fillStyle = rand() < 0.5 ? "#2c3033" : "#dfe3e8";
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  ctx.globalAlpha = 1;
  return texture(c);
}

// Riveted metal: cool blue-gray panels with seam lines and corner rivets.
function metalTexture(size = 128): THREE.Texture {
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#6d7a88";
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.06)");
  grad.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Panel seams.
  ctx.strokeStyle = "#4a545f";
  ctx.lineWidth = 2;
  const half = size / 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, size);
  ctx.moveTo(0, half);
  ctx.lineTo(size, half);
  ctx.stroke();
  // Rivets at panel corners.
  const rivets = [0.12, 0.38, 0.62, 0.88];
  for (const rx of rivets) {
    for (const ry of rivets) {
      ctx.fillStyle = "#aeb8c2";
      ctx.beginPath();
      ctx.arc(rx * size, ry * size, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c454e";
      ctx.beginPath();
      ctx.arc(rx * size + 0.6, ry * size + 0.6, 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return texture(c);
}

const FACTORIES: Record<Material, (size?: number) => THREE.Texture> = {
  wood: woodTexture,
  stone: stoneTexture,
  metal: metalTexture,
};

/** Procedural material for a build material id (browser only). */
export function makeBuildMaterial(material: Material): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: FACTORIES[material](),
    roughness: material === "metal" ? 0.45 : 0.9,
    metalness: material === "metal" ? 0.65 : 0.05,
  });
}
