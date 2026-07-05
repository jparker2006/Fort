// Build-mode controller: while active, it resolves the target slot from the
// camera aim ray every frame, colours the ghost by placement validity, and
// cycles stair/roof rotation on the rotate bind. Placement itself (primary
// fire, turbo, materials) lands in T11; this ticket is targeting + preview.

import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { CameraRig } from "../player/camera-rig.ts";
import type { Player } from "../player/player.ts";
import type { BuildModel } from "./build-model.ts";
import { Ghost } from "./ghost.ts";
import { resolveTarget, type Target } from "./targeting.ts";
import { pieceType, type PieceType, type Rotation } from "./piece.ts";

export class BuildController implements System {
  readonly name = "build-controller";

  private ghost!: Ghost;
  private active = false;
  private pieceType: PieceType = "wall";
  private rotationOffset: Rotation = 0;

  private target: Target | null = null;
  private valid = false;

  private readonly ray = new THREE.Ray();

  constructor(
    private readonly input: InputSystem,
    private readonly camera: CameraRig,
    private readonly player: Player,
    private readonly model: BuildModel,
  ) {}

  init(game: Game): void {
    this.ghost = new Ghost(game.scene);
  }

  /** Enter or leave build mode. Build mode swaps look sensitivity to "build". */
  setActive(active: boolean): void {
    this.active = active;
    this.camera.lookContext = active ? "build" : "look";
    if (!active) {
      this.ghost.hide();
      this.target = null;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  setPieceType(type: PieceType): void {
    this.pieceType = type;
    // A fresh piece type re-derives its default facing.
    this.rotationOffset = 0;
  }

  getPieceType(): PieceType {
    return this.pieceType;
  }

  cycleRotation(): void {
    this.rotationOffset = ((this.rotationOffset + 1) % 4) as Rotation;
  }

  getTarget(): Target | null {
    return this.target;
  }

  isValid(): boolean {
    return this.valid;
  }

  ghostColorState(): "valid" | "invalid" | "hidden" {
    if (!this.ghost.visible) return "hidden";
    return this.ghost.colorState;
  }

  update(): void {
    if (!this.active) return;

    if (this.input.justPressed("rotate")) this.cycleRotation();

    this.camera.getAimRay(this.ray);
    const s = this.player.state;
    this.target = resolveTarget({
      origin: { x: this.ray.origin.x, y: this.ray.origin.y, z: this.ray.origin.z },
      dir: { x: this.ray.direction.x, y: this.ray.direction.y, z: this.ray.direction.z },
      playerX: s.position.x,
      playerZ: s.position.z,
      playerFeetY: s.position.y,
      type: this.pieceType,
      rotationOffset: this.rotationOffset,
    });

    const res = this.model.canPlace(this.target.slot, {
      rotation: this.target.rotation,
      playerBox: this.player.getCollisionBox(),
    });
    this.valid = res.ok;
    this.ghost.show(pieceType(this.target.slot), this.target.slot, this.target.rotation, this.valid);
  }

  dispose(): void {
    this.ghost.dispose();
  }
}
