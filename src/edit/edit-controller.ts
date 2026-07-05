// Edit mode interaction (mechanics; the variant catalog is T14). Pressing edit
// while aiming at an owned piece within reach enters edit mode: the piece's
// selection grid appears, the crosshair highlights the hovered tile, holding
// primary fire drag-selects tiles (a drag that starts on an unselected tile
// selects, on a selected tile deselects), reset restores the piece's current
// selection, and confirm applies the mapped variant. Leaving reach cancels.

import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { CameraRig } from "../player/camera-rig.ts";
import type { Player } from "../player/player.ts";
import type { BuildModel } from "../build/build-model.ts";
import type { SensitivityContext } from "../input/sensitivity.ts";
import type { PieceType, Slot } from "../build/piece.ts";
import { pieceType } from "../build/piece.ts";
import { slotPlacement } from "../build/slots.ts";
import { CELL_SIZE } from "../world/grid.ts";
import { DEFAULT_GAMEPLAY, type GameplaySettings } from "../settings/gameplay.ts";
import { EditOverlay } from "./edit-overlay.ts";
import { faceFrame, rayTile, type FaceFrame } from "./edit-grid.ts";
import { variantToSelection, selectionToVariant } from "./variants-catalog.ts";

/** Edit reach along the aim ray from the camera (matches the Mattock reach). */
export const EDIT_REACH = 2.25 * CELL_SIZE;

export class EditController implements System {
  readonly name = "edit-controller";

  private overlay!: EditOverlay;
  private editing = false;
  private slot: Slot | null = null;
  private type: PieceType = "wall";
  private frame: FaceFrame | null = null;
  private selection = new Set<number>();
  private baseline = new Set<number>();
  private hovered = -1;
  private dragging = false;
  private dragMode: "add" | "remove" = "add";

  private prevContext: SensitivityContext = "look";
  private prevAimMode = false;
  private forcedHover: number | null = null;

  gameplay: GameplaySettings = { ...DEFAULT_GAMEPLAY };

  private readonly ray = new THREE.Ray();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly input: InputSystem,
    private readonly camera: CameraRig,
    private readonly player: Player,
    private readonly model: BuildModel,
  ) {}

  init(game: Game): void {
    this.overlay = new EditOverlay(game.scene);
  }

  isEditing(): boolean {
    return this.editing;
  }

  /** Cancel an in-progress edit without applying (used on pause). */
  cancel(): void {
    if (this.editing) this.exit(false);
  }

  update(): void {
    // Enter / confirm / reset gestures.
    if (!this.editing) {
      if (this.input.justPressed("edit")) this.tryEnter();
      return;
    }

    // A destroyed or vanished piece cancels the edit cleanly.
    if (!this.slot || !this.model.has(this.slot) || this.outOfReach()) {
      this.exit(false);
      return;
    }

    if (this.gameplay.confirmEditOnRelease) {
      if (this.input.justReleased("edit")) return this.exit(true);
    } else if (this.input.justPressed("edit")) {
      return this.exit(true);
    }

    const resetTrigger = this.gameplay.resetEditOnRelease
      ? this.input.justReleased("resetEdit")
      : this.input.justPressed("resetEdit");
    if (resetTrigger) this.reset();

    this.updateHoverAndDrag();
    this.overlay.setStates(this.selection, this.hovered);
  }

  private tryEnter(): void {
    this.camera.getAimRay(this.ray);
    this.raycaster.set(this.ray.origin, this.ray.direction);
    const hit = this.model.raycastPiece(this.raycaster, EDIT_REACH);
    if (!hit) return;

    this.slot = hit.slot;
    this.type = pieceType(hit.slot);
    this.frame = faceFrame(hit.slot);
    const variant = this.model.variantAt(hit.slot) ?? this.type;
    this.baseline = variantToSelection(this.type, variant);
    this.selection = new Set(this.baseline);
    this.hovered = -1;
    this.dragging = false;

    this.overlay.build(this.type, this.frame, {
      x: this.ray.origin.x,
      y: this.ray.origin.y,
      z: this.ray.origin.z,
    });
    this.prevContext = this.camera.lookContext;
    this.camera.lookContext = "edit";
    this.prevAimMode = this.player.aimMode;
    this.player.aimMode = true;
    this.editing = true;
  }

  private updateHoverAndDrag(): void {
    this.camera.getAimRay(this.ray);
    this.hovered =
      this.forcedHover !== null
        ? this.forcedHover
        : rayTile(
            this.frame!,
            { x: this.ray.origin.x, y: this.ray.origin.y, z: this.ray.origin.z },
            { x: this.ray.direction.x, y: this.ray.direction.y, z: this.ray.direction.z },
          );

    if (this.input.justPressed("primaryFire")) {
      this.dragging = true;
      // The drag mode is set by the first tile: unselected starts a select
      // drag, selected starts a deselect drag (Fortnite behavior).
      this.dragMode = this.hovered >= 0 && this.selection.has(this.hovered) ? "remove" : "add";
      this.applyDrag();
    } else if (this.input.isDown("primaryFire") && this.dragging) {
      this.applyDrag();
    }
    if (this.input.justReleased("primaryFire")) this.dragging = false;
  }

  private applyDrag(): void {
    if (this.hovered < 0) return;
    if (this.dragMode === "add") this.selection.add(this.hovered);
    else this.selection.delete(this.hovered);
  }

  private reset(): void {
    this.selection = new Set(this.baseline);
  }

  private outOfReach(): boolean {
    if (!this.slot) return true;
    const p = slotPlacement(this.slot, 0);
    const dx = p.x - this.player.state.position.x;
    const dz = p.z - this.player.state.position.z;
    // A little beyond the aim reach in the horizontal plane.
    return Math.hypot(dx, dz) > EDIT_REACH + CELL_SIZE;
  }

  private exit(apply: boolean): void {
    if (apply && this.slot) {
      const choice = selectionToVariant(this.type, this.selection);
      if (choice !== null) this.model.applyEdit(this.slot, choice.variant, choice.rotation);
    }
    this.editing = false;
    this.slot = null;
    this.frame = null;
    this.dragging = false;
    this.forcedHover = null;
    this.overlay.hide();
    this.camera.lookContext = this.prevContext;
    this.player.aimMode = this.prevAimMode;
  }

  // --- Test/debug surface ---

  /** Force the hovered tile (bypasses the ray) so drag-select is scriptable. */
  debugForceHover(index: number | null): void {
    this.forcedHover = index;
  }

  debugState(): { editing: boolean; type: string; hovered: number; selected: number[] } {
    return {
      editing: this.editing,
      type: this.type,
      hovered: this.hovered,
      selected: [...this.selection].sort((a, b) => a - b),
    };
  }

  dispose(): void {
    this.overlay.dispose();
  }
}
