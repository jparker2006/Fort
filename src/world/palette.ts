import * as THREE from "three";

// Shared world palette (T31): the sky, fog, and sun hues consumed by both the
// lighting rig (island.ts) and the procedural sky dome (sky.ts). Consolidating
// the trio here means one edit re-tints the whole scene; T33 refines the sky
// stops on top of this baseline. Values only, no image or LUT assets.
export const PALETTE = {
  // Sky gradient stops (T33 three-stop): deep zenith, a mid band, and a pale
  // horizon. The mid stop keeps the transition from banding on CPU renderers.
  skyZenith: 0x3579c8,
  skyMid: 0x8ec2e8,
  skyHorizon: 0xd4f0f6,
  // Atmospheric fog that blends the island edge into the horizon haze; matched
  // to the pale horizon so the seam disappears.
  fog: 0xc9e6f0,
  // Warm directional key light and its softer sky-side glow.
  sun: 0xffe9b8,
  sunGlow: 0xfff2cc,
  // Hemisphere ambient: cool sky bounce above, warm grass bounce below.
  hemiSky: 0xdfeffb,
  hemiGround: 0x4a6b3a,
} as const;

/** A fresh THREE.Color for a palette hex (never share Color instances across
 *  materials, which may mutate them). */
export const paletteColor = (hex: number): THREE.Color => new THREE.Color(hex);
