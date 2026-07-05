// Mattock destroy mode. While in mattock mode, primary fire swings at a melee
// cadence; each swing raycasts a short reach from the crosshair aim ray, hits at
// most one build piece (nearest, occlusion-correct), and applies material-scaled
// damage. Destroyed pieces free their slot, colliders, and instance immediately
// and throw an original spark burst; non-fatal hits throw a smaller flash.

import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { CameraRig } from "../player/camera-rig.ts";
import type { Player } from "../player/player.ts";
import type { BuildModel } from "./build-model.ts";
import { slotPlacement } from "./slots.ts";
import { BreakEffects, MATERIAL_TINT, type Tint } from "./effects.ts";
import { CELL_HEIGHT } from "../world/grid.ts";
import type { BuildMode } from "./build-controller.ts";

// Mattock reach and swing cadence (Fortnite melee pacing). Reach is measured
// along the aim ray from the camera, so the ~3.4 unit spring-arm boom leaves an
// effective reach of roughly 5.5 units in front of the player.
export const MATTOCK_REACH = 9;
export const MATTOCK_INTERVAL = 0.35;

export type SwingResult = "destroyed" | "damaged" | "miss";

export class DestroyController implements System {
  readonly name = "destroy-controller";

  private effects!: BreakEffects;
  private swingTimer = 0;

  private readonly ray = new THREE.Ray();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly input: InputSystem,
    private readonly camera: CameraRig,
    private readonly player: Player,
    private readonly model: BuildModel,
    private readonly getMode: () => BuildMode,
  ) {}

  init(game: Game): void {
    this.effects = new BreakEffects(game.scene);
  }

  update(dt: number): void {
    this.effects.update(dt);
    if (this.getMode() !== "mattock") return;

    this.swingTimer = Math.max(0, this.swingTimer - dt);
    const wants = this.input.justPressed("primaryFire") || this.input.isDown("primaryFire");
    if (wants && this.swingTimer <= 0) {
      this.swing();
      this.swingTimer = MATTOCK_INTERVAL;
    }
  }

  /** Perform one swing immediately (used by the melee loop and by tests). */
  swing(): SwingResult {
    this.player.triggerBuildSwing();
    this.camera.getAimRay(this.ray);
    this.raycaster.set(this.ray.origin, this.ray.direction);

    const hit = this.model.raycastPiece(this.raycaster, MATTOCK_REACH);
    if (!hit) return "miss";

    const piece = this.model.get(hit.slot);
    const tint: Tint = piece ? (MATERIAL_TINT[piece.material] ?? MATERIAL_TINT.wood!) : MATERIAL_TINT.wood!;
    const p = slotPlacement(hit.slot, piece?.rotation ?? 0);
    const cx = p.x;
    const cy = p.y + CELL_HEIGHT / 2;
    const cz = p.z;

    const res = this.model.damageAt(hit.slot);
    if (res === "destroyed") {
      this.effects.burst(cx, cy, cz, tint, 28, 4);
      return "destroyed";
    }
    if (res === "damaged") {
      this.effects.burst(cx, cy, cz, tint, 8, 2.5);
      return "damaged";
    }
    return "miss";
  }

  /** Test helper: number of live spark particles (bounded, proves no leak). */
  liveParticles(): number {
    return this.effects.liveCount();
  }

  /** Test helper: fire N bursts directly to exercise the ring buffer bound. */
  debugBurst(n: number): void {
    for (let i = 0; i < n; i++) this.effects.burst(0, 2, 0, MATERIAL_TINT.wood!, 28, 4);
  }

  dispose(): void {
    this.effects.dispose();
  }
}
