import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildHeroSkeleton } from "./hero.ts";
import { makeClips, RUN, RUN_REFERENCE_SPEED } from "./clips.ts";

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

describe("locomotion foot cadence", () => {
  it("plants the foot near body speed at mid-stance (imperceptible slide)", () => {
    const runSpeed = 5.5;
    const timeScale = runSpeed / RUN_REFERENCE_SPEED;
    const { zs, ys, dt } = sampleAnkle("run", timeScale, RUN.duration);

    // Peak backward foot speed while the foot is in the lower half of its arc
    // (planted) should match body speed within 15 percent: the visible contact
    // point is not sliding.
    const sortedY = [...ys].sort((a, b) => a - b);
    const yThresh = sortedY[Math.floor(ys.length * 0.5)]!;
    let peak = 0;
    for (let i = 1; i < zs.length; i++) {
      if (ys[i]! <= yThresh) {
        const spd = (zs[i]! - zs[i - 1]!) / dt;
        if (spd > peak) peak = spd;
      }
    }
    expect(Math.abs(peak - runSpeed) / runSpeed).toBeLessThan(0.15);
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
