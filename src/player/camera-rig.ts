import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { clampFov, type SensitivityContext } from "../input/sensitivity.ts";
import type { Player } from "./player.ts";

// Third-person over-the-shoulder camera. Yaw and pitch come from the input
// layer's look delta; the camera sits behind and to the right of the player's
// head on a spring arm that pulls in when geometry is in the way. The aim ray
// (camera origin along the view center) is the single authoritative aim source
// that building, editing, and destroy targeting all consume.

const PITCH_LIMIT = 1.35; // ~77 degrees up/down

export interface CameraTuning {
  shoulderRight: number;
  shoulderUp: number;
  boomDistance: number;
  /** Keep the camera this far off any surface it springs against. */
  collisionSkin: number;
  /** Never let the camera drop below this world height. */
  minHeight: number;
  /** Minimum distance from the pivot (so it cannot pass through the head). */
  minBoom: number;
}

export const DEFAULT_CAMERA_TUNING: CameraTuning = {
  shoulderRight: 0.65,
  shoulderUp: 0.15,
  boomDistance: 3.4,
  collisionSkin: 0.25,
  minHeight: 0.4,
  minBoom: 0.6,
};

export class CameraRig implements System {
  readonly name = "camera-rig";

  yaw = 0;
  pitch = -0.1; // slight downward gaze at spawn (negative pitch looks down)

  /** Sensitivity context for look input; build/edit modes swap this so their
   * per-context multipliers (T04) apply to aiming. */
  lookContext: SensitivityContext = "look";

  private game!: Game;
  private readonly colliders: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private currentFov = -1;

  // Scratch vectors reused every frame to avoid per-frame allocation.
  private readonly pivot = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly boomDir = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly quat = new THREE.Quaternion();

  constructor(
    private readonly input: InputSystem,
    private readonly player: Player,
    private readonly tuning: CameraTuning = DEFAULT_CAMERA_TUNING,
  ) {}

  init(game: Game): void {
    this.game = game;
  }

  /** Register a mesh the spring arm should collide against (build pieces, etc). */
  addCollider(obj: THREE.Object3D): void {
    this.colliders.push(obj);
  }

  removeCollider(obj: THREE.Object3D): void {
    const i = this.colliders.indexOf(obj);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  update(): void {
    // 1. Integrate look input (already scaled to radians by the input layer).
    // Negative pitch looks down, so subtract the downward-positive delta.
    const look = this.input.consumePointerDelta(this.lookContext);
    this.yaw -= look.yaw;
    this.pitch -= look.pitch;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));

    // 2. Build the view basis from yaw/pitch.
    this.euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.quat.setFromEuler(this.euler);
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);

    // 3. Pivot at the player head, shifted to the shoulder.
    this.player.state.headPosition(this.pivot);
    this.pivot.addScaledVector(this.right, this.tuning.shoulderRight);
    this.pivot.addScaledVector(this.up, this.tuning.shoulderUp);

    // 4. Desired camera position sits back along -forward by the boom length.
    this.desired.copy(this.pivot).addScaledVector(this.forward, -this.tuning.boomDistance);

    // 5. Spring arm: pull in if anything is between the pivot and the camera.
    this.boomDir.copy(this.desired).sub(this.pivot);
    let dist = this.boomDir.length();
    this.boomDir.normalize();
    if (dist > 1e-4 && this.colliders.length > 0) {
      this.raycaster.set(this.pivot, this.boomDir);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects(this.colliders, true);
      if (hits.length > 0) {
        dist = Math.max(this.tuning.minBoom, hits[0]!.distance - this.tuning.collisionSkin);
      }
    }

    const camPos = this.desired.copy(this.pivot).addScaledVector(this.boomDir, dist);
    camPos.y = Math.max(camPos.y, this.tuning.minHeight);

    this.game.camera.position.copy(camPos);
    this.game.camera.quaternion.copy(this.quat);

    // 6. Apply FOV from settings (clamped) when it changes.
    const fov = clampFov(this.input.settings.fov);
    if (fov !== this.currentFov) {
      this.currentFov = fov;
      this.game.camera.fov = fov;
      this.game.camera.updateProjectionMatrix();
    }
  }

  /**
   * The authoritative aim ray: origin at the camera, direction along the view
   * center (the crosshair). Building, editing, and destroy all use this.
   */
  getAimRay(out = new THREE.Ray()): THREE.Ray {
    out.origin.copy(this.game.camera.position);
    out.direction.copy(this.forward);
    return out;
  }

  /** Current camera distance from the pivot (post spring-arm). Test helper. */
  distanceToPivot(): number {
    return this.game.camera.position.distanceTo(this.pivot);
  }
}
