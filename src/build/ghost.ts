// The translucent placement preview. One mesh whose geometry swaps to the
// selected piece type and whose material is blue when the target is valid, red
// when blocked. Geometry matches the real placed piece exactly (same base
// geometry, same base-anchored placement), so the ghost is a faithful preview.

import * as THREE from "three";
import { baseGeometry, materialBaseColor } from "./variants.ts";
import { slotPlacement } from "./slots.ts";
import { MATERIALS, type Material, type PieceType, type Rotation, type Slot } from "./piece.ts";

const VALID_COLOR = 0x2f7fff;
const INVALID_COLOR = 0xff3b30;
// How far a valid ghost tints toward the selected material's base hue. Kept low
// enough that the blue channel still dominates for every material (T34), so the
// "valid" reading stays unmistakably blue rather than material-coloured.
export const VALID_TINT = 0.35;

/** Blend two packed RGB hexes in integer sRGB space (t = 0 -> a, 1 -> b). Pure
 *  math so the ghost tint is testable in Node without a color-managed context. */
export function blendHex(a: number, b: number, t: number): number {
  const lerp = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  const r = lerp((a >> 16) & 0xff, (b >> 16) & 0xff);
  const g = lerp((a >> 8) & 0xff, (b >> 8) & 0xff);
  const bl = lerp(a & 0xff, b & 0xff);
  return (r << 16) | (g << 8) | bl;
}

/** The valid-ghost hex for a material: the base blue blended VALID_TINT toward
 *  the material's field hue (T34). */
export function ghostValidHex(material: Material): number {
  return blendHex(VALID_COLOR, materialBaseColor(material), VALID_TINT);
}

export class Ghost {
  readonly mesh: THREE.Mesh;
  private readonly geoms = new Map<PieceType, THREE.BufferGeometry>();
  private readonly validMats = new Map<Material, THREE.MeshBasicMaterial>();
  private readonly invalidMat: THREE.MeshBasicMaterial;
  private currentType: PieceType | null = null;

  constructor(private readonly scene: THREE.Scene) {
    for (const material of MATERIALS) {
      this.validMats.set(
        material,
        new THREE.MeshBasicMaterial({
          color: ghostValidHex(material),
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
    }
    this.invalidMat = new THREE.MeshBasicMaterial({
      color: INVALID_COLOR,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geomFor("wall"), this.validMats.get("wood")!);
    this.mesh.name = "build-ghost";
    this.mesh.renderOrder = 10; // draw over the world
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  private geomFor(type: PieceType): THREE.BufferGeometry {
    let g = this.geoms.get(type);
    if (!g) {
      g = baseGeometry(type);
      this.geoms.set(type, g);
    }
    return g;
  }

  /** Position the ghost at a target slot and colour it by validity. A valid
   *  ghost is tinted toward the selected material (T34); invalid stays red. */
  show(type: PieceType, slot: Slot, rotation: Rotation, valid: boolean, material: Material): void {
    if (type !== this.currentType) {
      this.mesh.geometry = this.geomFor(type);
      this.currentType = type;
    }
    const p = slotPlacement(slot, rotation);
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.rotation.set(0, p.rotY, 0);
    this.mesh.material = valid ? this.validMats.get(material)! : this.invalidMat;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  /** The colour currently applied ("valid" or "invalid"); test helper. */
  get colorState(): "valid" | "invalid" {
    return this.mesh.material === this.invalidMat ? "invalid" : "valid";
  }

  /** Hex of the colour currently applied to the ghost material; test helper. */
  get colorHex(): number {
    return (this.mesh.material as THREE.MeshBasicMaterial).color.getHex();
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    for (const g of this.geoms.values()) g.dispose();
    for (const m of this.validMats.values()) m.dispose();
    this.invalidMat.dispose();
  }
}
