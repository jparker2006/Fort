import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildHeroSkeleton, type Hero } from "./hero.ts";
import { makeClips, RUN, SPRINT, RUN_REFERENCE_SPEED, SPRINT_REFERENCE_SPEED } from "./clips.ts";
import { AnimationController } from "./animation-controller.ts";
import { MOVE } from "../player/movement-tuning.ts";

// Play a locomotion clip on a bare skeleton (no mesh/canvas needed) and sample
// the left ankle's world position over time.
function sampleAnkle(clipName: keyof ReturnType<typeof makeClips>, timeScale: number, duration: number, cycles = 2) {
  const { root, map } = buildHeroSkeleton();
  const group = new THREE.Group();
  group.add(root);
  const mixer = new THREE.AnimationMixer(group);
  const clips = makeClips();
  const action = mixer.clipAction(clips[clipName]!);
  action.timeScale = timeScale;
  action.play();

  const ankle = map.get("ankleL")!;
  const v = new THREE.Vector3();
  const N = 400;
  const dt = (cycles * duration) / timeScale / N;
  const zs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < N; i++) {
    mixer.update(dt);
    ankle.getWorldPosition(v);
    zs.push(v.z);
    ys.push(v.y);
  }
  return { zs, ys, dt };
}

// Peak backward foot speed while the foot is planted (lower half of its arc);
// should track body speed for imperceptible slide.
function plantedFootPeak(clipName: "run" | "sprint", timeScale: number, duration: number): number {
  const { zs, ys, dt } = sampleAnkle(clipName, timeScale, duration);
  const sortedY = [...ys].sort((a, b) => a - b);
  const yThresh = sortedY[Math.floor(ys.length * 0.5)]!;
  let peak = 0;
  for (let i = 1; i < zs.length; i++) {
    if (ys[i]! <= yThresh) {
      const spd = (zs[i]! - zs[i - 1]!) / dt;
      if (spd > peak) peak = spd;
    }
  }
  return peak;
}

describe("locomotion foot cadence", () => {
  // T27 re-measure: the reference speeds are clip-intrinsic (peak foot speed at
  // timeScale 1), so retuning the game speeds does not move them; these two
  // assertions confirm foot-plant slide stays under 15 percent at the NEW jog
  // and sprint speeds, i.e. the references still hold post-retune.
  it("plants the jog foot near body speed at the retuned run speed (imperceptible slide)", () => {
    const peak = plantedFootPeak("run", MOVE.runSpeed / RUN_REFERENCE_SPEED, RUN.duration);
    expect(Math.abs(peak - MOVE.runSpeed) / MOVE.runSpeed).toBeLessThan(0.15);
  });

  it("plants the sprint foot near body speed at the retuned sprint speed", () => {
    const peak = plantedFootPeak("sprint", MOVE.sprintSpeed / SPRINT_REFERENCE_SPEED, SPRINT.duration);
    expect(Math.abs(peak - MOVE.sprintSpeed) / MOVE.sprintSpeed).toBeLessThan(0.15);
  });

  it("foot cadence scales with speed (faster body, faster steps)", () => {
    const slow = sampleAnkle("run", 4.0 / RUN_REFERENCE_SPEED, RUN.duration);
    const fast = sampleAnkle("run", 6.5 / RUN_REFERENCE_SPEED, RUN.duration);
    // Count backward-motion peaks (steps) over the same wall-clock window.
    const steps = (s: { zs: number[]; dt: number }) => {
      let count = 0;
      for (let i = 1; i < s.zs.length - 1; i++) {
        if (s.zs[i]! > s.zs[i - 1]! && s.zs[i]! >= s.zs[i + 1]!) count++;
      }
      return count;
    };
    // Same sample count but faster clip covers more cycles per second; compare
    // cycles over equal real time by normalizing dt.
    const slowRate = steps(slow) / (slow.zs.length * slow.dt);
    const fastRate = steps(fast) / (fast.zs.length * fast.dt);
    expect(fastRate).toBeGreaterThan(slowRate);
  });
});

describe("animation clips", () => {
  it("all expected clips exist with tracks", () => {
    const clips = makeClips();
    for (const name of ["idle", "run", "sprint", "crouchIdle", "crouchWalk", "jump", "buildSwing"]) {
      const c = clips[name as keyof typeof clips]!;
      expect(c, name).toBeTruthy();
      expect(c.tracks.length, name).toBeGreaterThan(0);
    }
  });

  it("build swing keys the right arm but not the legs (overlay, not full body)", () => {
    const swing = makeClips().buildSwing!;
    const names = swing.tracks.map((t) => t.name);
    expect(names.some((n) => n.startsWith("shoulderR"))).toBe(true);
    expect(names.some((n) => n.startsWith("hipL") || n.startsWith("kneeL"))).toBe(false);
  });
});

describe("locomotion state machine at the T27 speeds", () => {
  // Root the controller's mixer at a real bone hierarchy so the clip tracks bind
  // (no stray "no target node" warnings); only the state machine is under test.
  function makeController(): AnimationController {
    const { root } = buildHeroSkeleton();
    const group = new THREE.Group();
    group.add(root);
    return new AnimationController({ mesh: group } as unknown as Hero);
  }

  it("picks run at the retuned jog speed and sprint at the retuned sprint speed", () => {
    const ctrl = makeController();
    ctrl.setState({ speed: MOVE.runSpeed, onGround: true, crouching: false });
    expect(ctrl.currentState).toBe("run");
    ctrl.setState({ speed: MOVE.sprintSpeed, onGround: true, crouching: false });
    expect(ctrl.currentState).toBe("sprint"); // 6.0 clears the 5.3 sprint-clip threshold
  });

  it("keeps a plain jog on the run clip (does not trip the sprint threshold)", () => {
    const ctrl = makeController();
    ctrl.setState({ speed: MOVE.runSpeed, onGround: true, crouching: false });
    expect(ctrl.currentState).toBe("run"); // 4.7 stays below 5.3
  });

  it("keeps the run and sprint cadence timeScale inside the clamp band at the new speeds", () => {
    // timeScale = clamp(speed / reference, 0.6, 2.2); the retuned speeds must not
    // hit either rail, so the cadence tracks ground speed rather than saturating.
    const runScale = MOVE.runSpeed / RUN_REFERENCE_SPEED;
    const sprintScale = MOVE.sprintSpeed / SPRINT_REFERENCE_SPEED;
    expect(runScale).toBeGreaterThan(0.6);
    expect(runScale).toBeLessThan(2.2);
    expect(sprintScale).toBeGreaterThan(0.6);
    expect(sprintScale).toBeLessThan(2.2);
  });
});
