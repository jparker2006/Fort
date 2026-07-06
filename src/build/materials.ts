// Original procedural build materials: wood grain, brick-like stone, and
// brushed metal. Canvas-generated (no image files), so these only run in the
// browser; Node unit tests use the flat fallback in variants.ts instead. A
// seeded PRNG keeps every texture byte-stable across runs for screenshot and
// hash determinism (T32: 256 px, per-plank/brick/panel detail and seam AO).

import * as THREE from "three";
import type { Material } from "./piece.ts";

const SIZE = 256;

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

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

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

// Vertical wood planks: warm field (#96682f), per-plank value offsets, fine
// vertical grain, a few knots, and seam AO in the grooves between planks.
function woodTexture(size = SIZE): THREE.Texture {
  const { c, ctx } = canvas(size);
  const rand = mulberry32(0x7700_d1a1);
  ctx.fillStyle = "#96682f";
  ctx.fillRect(0, 0, size, size);

  const planks = 4;
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const x0 = p * pw;
    const off = (rand() - 0.5) * 46; // per-plank lighter/darker offset
    for (let x = 0; x < pw; x++) {
      const gx = Math.round(x0 + x);
      const grain =
        Math.sin(x * 0.30 + Math.sin(gx * 0.05) * 2.0) * 14 + Math.sin(x * 1.7) * 5;
      const base = 150 + off + grain;
      ctx.fillStyle = `rgb(${clampByte(base)},${clampByte(base * 0.70)},${clampByte(base * 0.33)})`;
      ctx.fillRect(gx, 0, 1, size);
    }
  }

  // Knots: small dark elliptical swirls scattered on the planks.
  for (let i = 0; i < 5; i++) {
    const kx = rand() * size;
    const ky = rand() * size;
    const kr = 2 + rand() * 4;
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `rgba(60,38,16,${0.28 - ring * 0.07})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr + ring * 2, (kr + ring * 2) * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Seam AO: multiply a soft ~10 percent darkening into each plank groove.
  ctx.globalCompositeOperation = "multiply";
  for (let p = 0; p <= planks; p++) {
    const sx = p * pw;
    const grad = ctx.createLinearGradient(sx - 4, 0, sx + 4, 0);
    grad.addColorStop(0, "rgb(255,255,255)");
    grad.addColorStop(0.5, "rgb(224,224,224)"); // ~12 percent darker at the seam
    grad.addColorStop(1, "rgb(255,255,255)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 4, 0, 8, size);
  }
  ctx.globalCompositeOperation = "source-over";
  return texture(c);
}

// Staggered brick stone: cool field (#6f747c), darker mortar, per-brick value
// jitter, seeded corner chips, and mortar AO along the lower/right brick edges.
function stoneTexture(size = SIZE): THREE.Texture {
  const { c, ctx } = canvas(size);
  const rand = mulberry32(0x5107_e2b3);
  ctx.fillStyle = "#565b61"; // mortar (darker than the brick field)
  ctx.fillRect(0, 0, size, size);

  const rows = 7;
  const bh = size / rows;
  const cols = 4;
  const bw = size / cols;
  const m = 2.5; // mortar gap
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let x = -bw; x < size; x += bw) {
      const bx = x + offset;
      const j = (rand() - 0.5) * 26; // per-brick value jitter
      ctx.fillStyle = `rgb(${clampByte(0x6f + j)},${clampByte(0x74 + j)},${clampByte(0x7c + j)})`;
      ctx.fillRect(bx + m, r * bh + m, bw - m * 2, bh - m * 2);

      // Mortar AO: a thin dark inset on the bottom and right edges gives depth.
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(bx + m, r * bh + bh - m - 2, bw - m * 2, 2);
      ctx.fillRect(bx + bw - m - 2, r * bh + m, 2, bh - m * 2);

      // Seeded corner chip: a small lighter/darker nick at one random corner.
      if (rand() < 0.5) {
        const cs = 3 + rand() * 3;
        ctx.fillStyle = rand() < 0.5 ? "rgba(20,22,24,0.35)" : "rgba(210,214,220,0.28)";
        const cxp = bx + (rand() < 0.5 ? m + 1 : bw - m - cs - 1);
        const cyp = r * bh + (rand() < 0.5 ? m + 1 : bh - m - cs - 1);
        ctx.fillRect(cxp, cyp, cs, cs);
      }
    }
  }

  // Fine speckle for surface tooth.
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < size * 4; i++) {
    ctx.fillStyle = rand() < 0.5 ? "#2c3033" : "#dfe3e8";
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  ctx.globalAlpha = 1;
  return texture(c);
}

// Brushed metal: cool field (#67788a), horizontal brushed streaks, a diagonal
// sheen, a 2x2 panel grid with panel-edge AO, and corner rivets.
function metalTexture(size = SIZE): THREE.Texture {
  const { c, ctx } = canvas(size);
  const rand = mulberry32(0x2b71_9c40);
  ctx.fillStyle = "#67788a";
  ctx.fillRect(0, 0, size, size);

  // Brushed horizontal streaks: many faint light/dark scan lines.
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < size * 3; i++) {
    const y = Math.floor(rand() * size) + 0.5;
    const x = Math.floor(rand() * size);
    const len = 20 + rand() * (size - 20);
    ctx.strokeStyle = rand() < 0.5 ? "#8b9aa8" : "#4c5966";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Diagonal sheen.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.06)");
  grad.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 2x2 panel seams.
  const half = size / 2;
  ctx.strokeStyle = "#3f4a55";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, size);
  ctx.moveTo(0, half);
  ctx.lineTo(size, half);
  ctx.stroke();

  // Panel-edge AO: multiply a soft darkening band along each seam.
  ctx.globalCompositeOperation = "multiply";
  const ao = (x0: number, y0: number, w: number, h: number, horiz: boolean) => {
    const g = horiz
      ? ctx.createLinearGradient(0, y0 - 5, 0, y0 + 5)
      : ctx.createLinearGradient(x0 - 5, 0, x0 + 5, 0);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(0.5, "rgb(228,228,228)"); // ~11 percent darker at the seam
    g.addColorStop(1, "rgb(255,255,255)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  };
  ao(half - 5, 0, 10, size, false);
  ao(0, half - 5, size, 10, true);
  ctx.globalCompositeOperation = "source-over";

  // Corner rivets on each panel.
  const rivets = [0.12, 0.38, 0.62, 0.88];
  for (const rx of rivets) {
    for (const ry of rivets) {
      ctx.fillStyle = "#aeb8c2";
      ctx.beginPath();
      ctx.arc(rx * size, ry * size, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c454e";
      ctx.beginPath();
      ctx.arc(rx * size + 0.7, ry * size + 0.7, 1.1, 0, Math.PI * 2);
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
