// The visual selection grid shown while editing a piece: one translucent quad
// per tile, coloured by state (unselected, hovered, selected). Tiles are laid
// out on the piece's face frame so they align to the geometry. Rebuilt when the
// edited piece changes; cleared when edit mode exits.

import * as THREE from "three";
import type { FaceFrame } from "./edit-grid.ts";
import { tileCenter, tileCount } from "./edit-grid.ts";
import type { PieceType } from "../build/piece.ts";
import type { Vec3 } from "../build/targeting.ts";

export type TileState = "idle" | "hover" | "selected";

const COLORS: Record<TileState, number> = {
  idle: 0x9fb4c8,
  hover: 0xffffff,
  selected: 0xff9d2e,
};
const OPACITY: Record<TileState, number> = {
  idle: 0.22,
  hover: 0.4,
  selected: 0.62,
};

export class EditOverlay {
  private readonly group = new THREE.Group();
  private tiles: THREE.Mesh[] = [];
  private readonly materials: Record<TileState, THREE.MeshBasicMaterial>;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = "edit-overlay";
    this.group.renderOrder = 12;
    this.group.visible = false;
    this.scene.add(this.group);
    this.materials = {
      idle: this.mat("idle"),
      hover: this.mat("hover"),
      selected: this.mat("selected"),
    };
  }

  private mat(state: TileState): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: COLORS[state],
      transparent: true,
      opacity: OPACITY[state],
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /** Build the tile quads for a piece's face frame, floated toward the viewer so
   * they clear the piece surface and are never occluded by it. */
  build(type: PieceType, frame: FaceFrame, viewer: Vec3): void {
    this.clearTiles();
    const uUnit = norm(frame.uAxis);
    const vUnit = norm(frame.vAxis);
    const nUnit = norm(frame.normal);
    const tileU = len(frame.uAxis) / frame.cols;
    const tileV = len(frame.vAxis) / frame.rows;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(uUnit.x, uUnit.y, uUnit.z),
      new THREE.Vector3(vUnit.x, vUnit.y, vUnit.z),
      new THREE.Vector3(nUnit.x, nUnit.y, nUnit.z),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const n = tileCount(type);
    const center0 = tileCenter(frame, 0);
    // Offset along the normal toward the viewer, past the piece's half-thickness.
    const toViewer =
      (viewer.x - center0.x) * nUnit.x +
      (viewer.y - center0.y) * nUnit.y +
      (viewer.z - center0.z) * nUnit.z;
    const sign = toViewer >= 0 ? 1 : -1;
    const off = 0.25 * sign;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(tileU * 0.9, tileV * 0.9);
      const mesh = new THREE.Mesh(geo, this.materials.idle);
      const c = tileCenter(frame, i);
      mesh.position.set(c.x + nUnit.x * off, c.y + nUnit.y * off, c.z + nUnit.z * off);
      mesh.quaternion.copy(quat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tiles.push(mesh);
    }
    this.group.visible = true;
  }

  /** Recolour tiles: selected set, plus an optional hovered tile. */
  setStates(selected: Set<number>, hovered: number): void {
    for (let i = 0; i < this.tiles.length; i++) {
      const state: TileState = selected.has(i) ? "selected" : i === hovered ? "hover" : "idle";
      this.tiles[i]!.material = this.materials[state];
    }
  }

  hide(): void {
    this.group.visible = false;
    this.clearTiles();
  }

  get visible(): boolean {
    return this.group.visible;
  }

  get tileWorldCenters(): Vec3[] {
    return this.tiles.map((t) => ({ x: t.position.x, y: t.position.y, z: t.position.z }));
  }

  private clearTiles(): void {
    for (const t of this.tiles) {
      this.group.remove(t);
      t.geometry.dispose();
    }
    this.tiles = [];
  }

  dispose(): void {
    this.hide();
    this.scene.remove(this.group);
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

function len(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}
function norm(v: Vec3): Vec3 {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
