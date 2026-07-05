import * as THREE from "three";
import type { Hero } from "./hero.ts";
import { makeClips, RUN_REFERENCE_SPEED, SPRINT_REFERENCE_SPEED } from "./clips.ts";

// Drives the hero's animation: a locomotion state machine with crossfades, an
// additive build-swing overlay that does not freeze the legs, cadence that
// scales with speed to keep foot slide small, and aim-mode facing.

export interface AnimInput {
  speed: number;
  onGround: boolean;
  crouching: boolean;
}

const WALK_THRESHOLD = 0.4;
const RUN_REF = RUN_REFERENCE_SPEED;
const SPRINT_REF = SPRINT_REFERENCE_SPEED;
const SPRINT_SPEED = 6.0; // above this, use the sprint clip

export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly swing: THREE.AnimationAction;
  private current = "idle";

  constructor(hero: Hero) {
    this.mixer = new THREE.AnimationMixer(hero.mesh);
    const clips = makeClips();

    for (const name of ["idle", "run", "sprint", "crouchIdle", "crouchWalk", "jump"]) {
      const action = this.mixer.clipAction(clips[name]!);
      action.enabled = true;
      this.actions.set(name, action);
    }

    // Build-swing is additive so it layers on top of whatever the legs are doing.
    const swingClip = clips.buildSwing!;
    THREE.AnimationUtils.makeClipAdditive(swingClip);
    this.swing = this.mixer.clipAction(swingClip, undefined, THREE.AdditiveAnimationBlendMode);
    this.swing.loop = THREE.LoopOnce;
    this.swing.clampWhenFinished = false;

    this.actions.get("idle")!.play();
  }

  private pick(input: AnimInput): string {
    if (!input.onGround) return "jump";
    if (input.crouching) return input.speed > WALK_THRESHOLD ? "crouchWalk" : "crouchIdle";
    if (input.speed > SPRINT_SPEED) return "sprint";
    if (input.speed > WALK_THRESHOLD) return "run";
    return "idle";
  }

  setState(input: AnimInput): void {
    const next = this.pick(input);
    if (next !== this.current) {
      const from = this.actions.get(this.current)!;
      const to = this.actions.get(next)!;
      to.reset();
      to.enabled = true;
      to.setEffectiveWeight(1);
      from.crossFadeTo(to, 0.15, false);
      to.play();
      this.current = next;
    }

    // Cadence: scale the locomotion clip so foot plant tracks ground speed.
    if (next === "run") {
      this.actions.get("run")!.timeScale = clamp(input.speed / RUN_REF, 0.6, 2.2);
    } else if (next === "sprint") {
      this.actions.get("sprint")!.timeScale = clamp(input.speed / SPRINT_REF, 0.6, 2.2);
    } else if (next === "crouchWalk") {
      this.actions.get("crouchWalk")!.timeScale = clamp(input.speed / 2.4, 0.6, 2.0);
    }
  }

  /** Trigger a one-shot Mattock swing overlaid on the current locomotion. */
  triggerBuildSwing(): void {
    this.swing.reset();
    this.swing.setEffectiveWeight(1);
    this.swing.play();
  }

  get currentState(): string {
    return this.current;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
