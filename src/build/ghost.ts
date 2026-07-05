// The translucent placement preview. One mesh whose geometry swaps to the
// selected piece type and whose material is blue when the target is valid, red
// when blocked. Geometry matches the real placed piece exactly (same base
// geometry, same base-anchored placement), so the ghost is a faithful preview.

import * as THREE from "three";
import { baseGeometry } from "./variants.ts";
import { slotPlacement } from "./slots.ts";
import type { PieceType, Rotation, Slot } from "./piece.ts";

const VALID_COLOR = 0x2f7fff;
const INVALID_COLOR = 0xff3b30;

export class Ghost {
  readonly mesh: THREE.Mesh;
  private readonly geoms = new Map<PieceType, THREE.BufferGeometry>();
  private readonly validMat: THREE.MeshBasicMaterial;
  private readonly invalidMat: THREE.MeshBasicMaterial;
  private currentType: PieceType | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.validMat = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.invalidMat = new THREE.MeshBasicMaterial({
      color: INVALID_COLOR,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geomFor("wall"), this.validMat);
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

  /** Position the ghost at a target slot and colour it by validity. */
  show(type: PieceType, slot: Slot, rotation: Rotation, valid: boolean): void {
    if (type !== this.currentType) {
      this.mesh.geometry = this.geomFor(type);
      this.currentType = type;
    }
    const p = slotPlacement(slot, rotation);
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.rotation.set(0, p.rotY, 0);
    this.mesh.material = valid ? this.validMat : this.invalidMat;
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
    return this.mesh.material === this.validMat ? "valid" : "invalid";
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    for (const g of this.geoms.values()) g.dispose();
    this.validMat.dispose();
    this.invalidMat.dispose();
  }
}
