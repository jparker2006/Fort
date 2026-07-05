import { describe, it, expect } from "vitest";
import { scalePointerDelta, RAD_PER_PIXEL, type InputSettings } from "./sensitivity.ts";

const base: InputSettings = {
  lookSensitivity: 2,
  targetingSensitivity: 0.5,
  buildSensitivityMultiplier: 1.5,
  editSensitivityMultiplier: 0.3,
  invertY: false,
};

describe("scalePointerDelta", () => {
  it("applies base look sensitivity", () => {
    const d = scalePointerDelta(100, 40, "look", base);
    expect(d.yaw).toBeCloseTo(100 * RAD_PER_PIXEL * 2, 6);
    expect(d.pitch).toBeCloseTo(40 * RAD_PER_PIXEL * 2, 6);
  });

  it("uses the separate targeting base, not look", () => {
    const d = scalePointerDelta(100, 0, "targeting", base);
    expect(d.yaw).toBeCloseTo(100 * RAD_PER_PIXEL * 0.5, 6);
  });

  it("build context multiplies look by the build multiplier", () => {
    const d = scalePointerDelta(100, 0, "build", base);
    expect(d.yaw).toBeCloseTo(100 * RAD_PER_PIXEL * (2 * 1.5), 6);
  });

  it("edit context multiplies look by the edit multiplier", () => {
    const d = scalePointerDelta(100, 0, "edit", base);
    expect(d.yaw).toBeCloseTo(100 * RAD_PER_PIXEL * (2 * 0.3), 6);
  });

  it("invert Y flips pitch only", () => {
    const normal = scalePointerDelta(10, 10, "look", base);
    const inverted = scalePointerDelta(10, 10, "look", { ...base, invertY: true });
    expect(inverted.yaw).toBeCloseTo(normal.yaw, 6);
    expect(inverted.pitch).toBeCloseTo(-normal.pitch, 6);
  });

  it("the four contexts are genuinely distinct", () => {
    const yaw = (ctx: "look" | "targeting" | "build" | "edit") =>
      scalePointerDelta(100, 0, ctx, base).yaw;
    const values = new Set([yaw("look"), yaw("targeting"), yaw("build"), yaw("edit")]);
    expect(values.size).toBe(4);
  });
});
