// Mouse sensitivity model. The four contexts each resolve to an effective
// sensitivity; build and edit are multipliers on the base look sensitivity,
// targeting is its own base value (aim-down behavior). Invert Y flips pitch.
//
// scalePointerDelta is pure so it can be unit-tested with synthetic deltas
// (T04 acceptance) without any DOM.

export type SensitivityContext = "look" | "targeting" | "build" | "edit";

export interface InputSettings {
  lookSensitivity: number;
  targetingSensitivity: number;
  buildSensitivityMultiplier: number;
  editSensitivityMultiplier: number;
  invertY: boolean;
}

/** Yaw radians produced by one pixel of raw mouse motion at sensitivity 1.0. */
export const RAD_PER_PIXEL = 0.0032;

export function contextSensitivity(ctx: SensitivityContext, s: InputSettings): number {
  switch (ctx) {
    case "look":
      return s.lookSensitivity;
    case "targeting":
      return s.targetingSensitivity;
    case "build":
      return s.lookSensitivity * s.buildSensitivityMultiplier;
    case "edit":
      return s.lookSensitivity * s.editSensitivityMultiplier;
  }
}

export interface PointerDelta {
  /** Horizontal look delta in radians (positive when the mouse moves right). */
  yaw: number;
  /** Vertical look delta in radians (positive when the mouse moves down). */
  pitch: number;
}

export function scalePointerDelta(
  rawDx: number,
  rawDy: number,
  ctx: SensitivityContext,
  s: InputSettings,
): PointerDelta {
  const sens = contextSensitivity(ctx, s) * RAD_PER_PIXEL;
  const yaw = rawDx * sens;
  let pitch = rawDy * sens;
  if (s.invertY) pitch = -pitch;
  return { yaw, pitch };
}
