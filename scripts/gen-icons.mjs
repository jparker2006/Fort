// Generates the original PWA icon set from code: no external art, no image
// editors. A tiny PNG encoder (Node zlib for the IDAT) writes RGBA buffers we
// paint with a stylized Fort build-grid mark in the hero palette (teal keep,
// slate ground, copper accent). Run: `node scripts/gen-icons.mjs`.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// --- PNG encoder ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10-12: compression, filter, interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Painting ------------------------------------------------------------

function makeCanvas(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // Alpha-over composite.
    const ia = a / 255;
    rgba[i] = Math.round(rgba[i] * (1 - ia) + r * ia);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - ia) + g * ia);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - ia) + b * ia);
    rgba[i + 3] = Math.max(rgba[i + 3], a);
  };
  return { rgba, set };
}

function rect(c, x0, y0, w, h, col) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.set(x, y, col[0], col[1], col[2], col[3] ?? 255);
}

function roundRect(c, x0, y0, w, h, r, col) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x);
      const dy = Math.min(y, h - 1 - y);
      if (dx < r && dy < r) {
        const ddx = r - dx;
        const ddy = r - dy;
        if (ddx * ddx + ddy * ddy > r * r) continue;
      }
      c.set(x0 + x, y0 + y, col[0], col[1], col[2], col[3] ?? 255);
    }
  }
}

const SLATE_TOP = [32, 50, 59];
const SLATE_BOT = [16, 27, 33];
const TEAL = [39, 163, 160];
const TEAL_LT = [90, 200, 198];
const COPPER = [207, 125, 60];

// Paint the Fort mark. `inset` scales the mark for maskable safe-zone framing.
function paint(size, insetFrac) {
  const c = makeCanvas(size);
  // Full-bleed slate vertical gradient.
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const col = [
      Math.round(SLATE_TOP[0] + (SLATE_BOT[0] - SLATE_TOP[0]) * t),
      Math.round(SLATE_TOP[1] + (SLATE_BOT[1] - SLATE_TOP[1]) * t),
      Math.round(SLATE_TOP[2] + (SLATE_BOT[2] - SLATE_TOP[2]) * t),
    ];
    rect(c, 0, y, size, 1, col);
  }

  // Centered teal keep block with a 3x3 build-grid (the edit-grid motif) and a
  // copper corner accent. insetFrac leaves a safe margin for maskable icons.
  const margin = Math.round(size * insetFrac);
  const s = size - margin * 2;
  const x0 = margin;
  const y0 = margin;
  const r = Math.round(s * 0.12);
  roundRect(c, x0, y0, s, s, r, TEAL);

  // Grid lines (3x3).
  const gw = Math.max(2, Math.round(size * 0.014));
  for (let k = 1; k < 3; k++) {
    const gx = x0 + Math.round((s * k) / 3) - Math.floor(gw / 2);
    rect(c, gx, y0, gw, s, TEAL_LT);
    const gy = y0 + Math.round((s * k) / 3) - Math.floor(gw / 2);
    rect(c, x0, gy, s, gw, TEAL_LT);
  }

  // Copper accent: fill the bottom-left grid cell (a placed piece).
  const cell = Math.round(s / 3);
  rect(c, x0 + gw, y0 + s - cell + gw, cell - gw * 2, cell - gw * 2, COPPER);

  return encodePng(size, size, c.rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), paint(size, 0.16));
  // Maskable: keep the mark inside the ~80% safe zone with full-bleed slate.
  writeFileSync(join(OUT, `icon-${size}-maskable.png`), paint(size, 0.24));
}
console.log("Generated original PWA icons in public/icons");
