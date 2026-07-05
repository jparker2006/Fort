import { describe, it, expect } from "vitest";
import { FixedStepper } from "./time.ts";

describe("FixedStepper", () => {
  it("runs one step per fixed delta at matched cadence", () => {
    const s = new FixedStepper(120);
    // A 120 Hz display feeding exactly one fixed delta per frame.
    const r = s.advance(1 / 120);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0, 5);
  });

  it("runs two steps when a 60 Hz frame spans two 120 Hz sim steps", () => {
    const s = new FixedStepper(120);
    const r = s.advance(1 / 60);
    expect(r.steps).toBe(2);
  });

  it("carries leftover time into alpha instead of dropping it", () => {
    const s = new FixedStepper(120);
    // 144 Hz frame: shorter than one 120 Hz step, so no step yet but alpha grows.
    const r1 = s.advance(1 / 144);
    expect(r1.steps).toBe(0);
    expect(r1.alpha).toBeGreaterThan(0);
    expect(r1.alpha).toBeLessThan(1);
    // Accumulating another frame eventually crosses a full step.
    const r2 = s.advance(1 / 144);
    expect(r2.steps).toBe(1);
  });

  it("clamps a long stall to maxSteps (no spiral of death)", () => {
    const s = new FixedStepper(120, 8);
    // A 2 second stall would be 240 steps unclamped; must cap at maxSteps.
    const r = s.advance(2.0);
    expect(r.steps).toBe(8);
  });

  it("treats negative or non-finite deltas as zero", () => {
    const s = new FixedStepper(120);
    expect(s.advance(-1).steps).toBe(0);
    expect(s.advance(Number.NaN).steps).toBe(0);
    expect(s.advance(Number.POSITIVE_INFINITY).steps).toBe(0);
  });

  it("reset drops accumulated time so the next frame starts clean", () => {
    const s = new FixedStepper(120);
    s.advance(1 / 200); // partial accumulation
    s.reset();
    const r = s.advance(1 / 200);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo((1 / 200) * 120, 5);
  });

  it("keeps alpha in [0, 1) across a random walk of frame deltas", () => {
    const s = new FixedStepper(120, 8);
    const deltas = [0.004, 0.02, 0.001, 0.5, 0.008, 0.016, 0.0001, 0.033];
    for (const d of deltas) {
      const r = s.advance(d);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      expect(r.steps).toBeGreaterThanOrEqual(0);
      expect(r.steps).toBeLessThanOrEqual(8);
    }
  });
});
