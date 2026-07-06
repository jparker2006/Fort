import { describe, it, expect } from "vitest";
import { blendHex, ghostValidHex, VALID_TINT } from "./ghost.ts";
import { materialBaseColor } from "./variants.ts";

const chan = (hex: number) => ({ r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff });

describe("ghost valid-tint blend math (T34)", () => {
  it("blends endpoints and midpoints correctly", () => {
    expect(blendHex(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(blendHex(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(blendHex(0x000000, 0xffffff, 0.5)).toBe(0x808080); // round(127.5) -> 128
  });

  it("tints the base blue 35 percent toward each material's field hue", () => {
    // Exact expected hexes for the three materials at VALID_TINT.
    expect(ghostValidHex("wood")).toBe(0x5377b6);
    expect(ghostValidHex("stone")).toBe(0x457bd1);
    expect(ghostValidHex("metal")).toBe(0x437dd6);
  });

  it("keeps the blue channel dominant for every material (still reads as valid)", () => {
    for (const m of ["wood", "stone", "metal"] as const) {
      const c = chan(ghostValidHex(m));
      expect(c.b).toBeGreaterThan(c.r); // blue over red
      expect(c.b).toBeGreaterThan(c.g); // blue over green
    }
  });

  it("moves each channel exactly VALID_TINT of the way toward the material", () => {
    // Independent re-derivation of the blend for wood.
    const base = 0x2f7fff;
    const wood = materialBaseColor("wood");
    const expected = chan(base);
    const woodCh = chan(wood);
    const r = Math.round(expected.r * (1 - VALID_TINT) + woodCh.r * VALID_TINT);
    const g = Math.round(expected.g * (1 - VALID_TINT) + woodCh.g * VALID_TINT);
    const b = Math.round(expected.b * (1 - VALID_TINT) + woodCh.b * VALID_TINT);
    expect(ghostValidHex("wood")).toBe((r << 16) | (g << 8) | b);
  });
});
