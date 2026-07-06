import * as THREE from "three";
import { MOVE } from "./movement-tuning.ts";

// Shared player state. T05 uses position, crouch, and eye height for the camera
// pivot; T06 fills in the movement that drives position and velocity.

export const PLAYER = {
  radius: 0.4,
  standHeight: 1.8,
  crouchHeight: 1.2,
  /** Eye height above the feet when standing / crouched. */
  standEye: 1.62,
  crouchEye: 1.05,
  /** Crouch blend speed, in blend-units per second (no pop, quick settle). */
  crouchLerpRate: 12,
} as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class PlayerState {
  /** Feet position (bottom of the capsule) in world space. */
  readonly position = new THREE.Vector3(0, 0, 0);
  readonly velocity = new THREE.Vector3(0, 0, 0);

  /** Facing yaw of the character body (radians). Camera yaw is separate. */
  yaw = 0;
  onGround = true;
  crouching = false;

  /** 0 = standing, 1 = fully crouched; smoothed each fixed step. */
  crouchBlend = 0;

  /** Sprint stamina in seconds (T29); starts full. */
  stamina: number = MOVE.staminaMax;
  /** Latched true when stamina reaches zero; cleared once it recovers above the
   * re-engage fraction, so sprint cannot flicker on and off at empty. */
  sprintBlocked = false;

  /** Stamina as a 0..1 fraction, for the HUD bar and the debug probe. */
  get staminaFraction(): number {
    return this.stamina / MOVE.staminaMax;
  }

  /** Advance the crouch blend toward the current crouch intent. */
  updateCrouchBlend(dt: number): void {
    const target = this.crouching ? 1 : 0;
    const step = PLAYER.crouchLerpRate * dt;
    if (this.crouchBlend < target) {
      this.crouchBlend = Math.min(target, this.crouchBlend + step);
    } else if (this.crouchBlend > target) {
      this.crouchBlend = Math.max(target, this.crouchBlend - step);
    }
  }

  get height(): number {
    return lerp(PLAYER.standHeight, PLAYER.crouchHeight, this.crouchBlend);
  }

  get eyeHeight(): number {
    return lerp(PLAYER.standEye, PLAYER.crouchEye, this.crouchBlend);
  }

  /** World-space eye/head position used as the camera pivot. */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
}
