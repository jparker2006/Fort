// Build-mode controller: drives the mode state machine (movement / build /
// mattock), resolves the target slot from the camera aim ray while building,
// colours the ghost by validity, cycles rotation and material, and places
// pieces on primary fire (single tap or held turbo build). Destroy in mattock
// mode is handled by T12; this controller owns the placement half.

import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { CameraRig } from "../player/camera-rig.ts";
import type { Player } from "../player/player.ts";
import type { BuildModel } from "./build-model.ts";
import { Ghost } from "./ghost.ts";
import { resolveTarget, type Target } from "./targeting.ts";
import { pieceType, MATERIALS, type Material, type PieceType, type Rotation } from "./piece.ts";
import { slotKey } from "./slots.ts";
import { DEFAULT_GAMEPLAY, type GameplaySettings } from "../settings/gameplay.ts";

export type BuildMode = "movement" | "build" | "mattock";

/** Turbo build retry cadence (Fortnite-like ~100 ms between placements). */
export const TURBO_INTERVAL = 0.1;

// The piece-select action -> piece type mapping.
const PIECE_BINDS: ReadonlyArray<[Parameters<InputSystem["justPressed"]>[0], PieceType]> = [
  ["buildWall", "wall"],
  ["buildFloor", "floor"],
  ["buildStairs", "stairs"],
  ["buildRoof", "roof"],
];

export class BuildController implements System {
  readonly name = "build-controller";

  private ghost!: Ghost;
  private mode: BuildMode = "movement";
  private pieceType: PieceType = "wall";
  private rotationOffset: Rotation = 0;
  private material: Material = "wood";

  private target: Target | null = null;
  private valid = false;

  private turboTimer = 0;
  private lastPlacedKey: string | null = null;

  gameplay: GameplaySettings = { ...DEFAULT_GAMEPLAY };

  // While editing, primary fire drag-selects tiles instead of placing pieces.
  private suppressed: () => boolean = () => false;

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

  // --- Mode ---

  setMode(mode: BuildMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.camera.lookContext = mode === "build" ? "build" : "look";
    // Building and harvesting face the camera aim (Fortnite build-mode facing).
    this.player.aimMode = mode !== "movement";
    if (mode !== "build") {
      this.ghost.hide();
      this.target = null;
    }
    this.lastPlacedKey = null;
    this.turboTimer = 0;
  }

  getMode(): BuildMode {
    return this.mode;
  }

  /** Back-compat helper used by targeting tests: build mode on/off. */
  setActive(active: boolean): void {
    this.setMode(active ? "build" : "movement");
  }

  isActive(): boolean {
    return this.mode === "build";
  }

  /** Route primary fire away from placement while another system (edit) owns it. */
  setSuppressor(fn: () => boolean): void {
    this.suppressed = fn;
  }

  /** Clear transient placement state (turbo run, ghost) safely, e.g. on pause. */
  cancelTransient(): void {
    this.turboTimer = 0;
    this.lastPlacedKey = null;
    this.ghost?.hide();
  }

  setPieceType(type: PieceType): void {
    this.pieceType = type;
    this.rotationOffset = 0;
  }

  getPieceType(): PieceType {
    return this.pieceType;
  }

  cycleRotation(): void {
    this.rotationOffset = ((this.rotationOffset + 1) % 4) as Rotation;
  }

  getMaterial(): Material {
    return this.material;
  }

  cycleMaterial(): void {
    const i = MATERIALS.indexOf(this.material);
    this.material = MATERIALS[(i + 1) % MATERIALS.length]!;
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

  /** Hex of the ghost's currently applied colour (blue valid / red invalid). */
  ghostColorHex(): number {
    return this.ghost.colorHex;
  }

  // --- Frame ---

  update(dt: number): void {
    // While editing, the edit controller owns the crosshair and primary fire.
    if (this.suppressed()) {
      this.ghost.hide();
      return;
    }
    this.handleModeBinds();
    if (this.mode === "build") {
      this.updateBuild(dt);
    } else {
      this.ghost.hide();
    }
  }

  private handleModeBinds(): void {
    // Piece-select binds enter build mode and switch the active piece.
    for (const [action, type] of PIECE_BINDS) {
      if (this.input.justPressed(action)) {
        this.setPieceType(type);
        this.setMode("build");
      }
    }
    // Build/combat toggle swaps between building and the Mattock carry.
    if (this.input.justPressed("buildCombatToggle")) {
      this.setMode(this.mode === "mattock" ? "build" : "mattock");
    }
    // Material cycle applies in build mode (and is harmless elsewhere).
    if (this.input.justPressed("materialCycle")) this.cycleMaterial();
  }

  private updateBuild(dt: number): void {
    if (this.input.justPressed("rotate")) this.cycleRotation();

    this.resolveAndPreview();

    const firePressed = this.input.justPressed("primaryFire");
    const fireHeld = this.input.isDown("primaryFire");

    if (firePressed && this.valid) {
      this.placeTarget();
      this.turboTimer = 0;
    } else if (this.gameplay.turboBuild && fireHeld) {
      this.turboTimer += dt;
      if (this.turboTimer >= TURBO_INTERVAL) {
        this.turboTimer = 0;
        const key = this.target ? slotKey(this.target.slot) : null;
        // Only place into a fresh valid slot (never twice into the same one).
        if (this.valid && key !== null && key !== this.lastPlacedKey) this.placeTarget();
      }
    }
    if (!fireHeld) this.lastPlacedKey = null;
  }

  private resolveAndPreview(): void {
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

  /** Place the currently targeted piece with the active material. */
  private placeTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    const ok = this.model.place(t.slot, {
      material: this.material,
      rotation: t.rotation,
      playerBox: this.player.getCollisionBox(),
    });
    if (ok) {
      this.lastPlacedKey = slotKey(t.slot);
      this.player.triggerBuildSwing();
    }
    return ok;
  }

  dispose(): void {
    this.ghost.dispose();
  }
}
