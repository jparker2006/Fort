// Humanoid skeleton definition in bind-pose world space (feet on y = 0, facing
// local -Z to match the camera forward). Bone local translations are derived
// from these world positions. The character stands about 1.8 units tall.

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Bind-pose world position of the bone head. */
  pos: [number, number, number];
}

export const BONES: BoneDef[] = [
  { name: "root", parent: null, pos: [0, 0, 0] },
  { name: "hips", parent: "root", pos: [0, 0.95, 0] },
  { name: "spine", parent: "hips", pos: [0, 1.18, 0] },
  { name: "chest", parent: "spine", pos: [0, 1.4, 0] },
  { name: "neck", parent: "chest", pos: [0, 1.54, 0] },
  { name: "head", parent: "neck", pos: [0, 1.66, 0] },

  { name: "shoulderL", parent: "chest", pos: [0.16, 1.46, 0] },
  { name: "elbowL", parent: "shoulderL", pos: [0.3, 1.2, 0] },
  { name: "wristL", parent: "elbowL", pos: [0.37, 0.98, 0] },

  { name: "shoulderR", parent: "chest", pos: [-0.16, 1.46, 0] },
  { name: "elbowR", parent: "shoulderR", pos: [-0.3, 1.2, 0] },
  { name: "wristR", parent: "elbowR", pos: [-0.37, 0.98, 0] },

  { name: "hipL", parent: "hips", pos: [0.11, 0.9, 0] },
  { name: "kneeL", parent: "hipL", pos: [0.12, 0.5, 0] },
  { name: "ankleL", parent: "kneeL", pos: [0.12, 0.1, 0] },

  { name: "hipR", parent: "hips", pos: [-0.11, 0.9, 0] },
  { name: "kneeR", parent: "hipR", pos: [-0.12, 0.5, 0] },
  { name: "ankleR", parent: "kneeR", pos: [-0.12, 0.1, 0] },
];

/** Approximate standing height, used for scale checks. */
export const HERO_HEIGHT = 1.8;

// Child map for building bone tails (used by the auto-weighting segments).
export function childrenOf(name: string): BoneDef[] {
  return BONES.filter((b) => b.parent === name);
}
