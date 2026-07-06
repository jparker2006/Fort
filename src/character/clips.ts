import * as THREE from "three";

// Hand-authored keyframe clips, generated procedurally as bone-rotation tracks.
// Each keyframe is a set of per-bone euler rotations; bones not listed stay at
// rest. Track names use bone names so an AnimationMixer rooted at the hero
// resolves them.

export interface Keyframe {
  t: number;
  pose: Record<string, [number, number, number]>;
}

function clip(name: string, duration: number, keys: Keyframe[]): THREE.AnimationClip {
  const bones = new Set<string>();
  for (const k of keys) for (const b of Object.keys(k.pose)) bones.add(b);

  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const bone of bones) {
    const times: number[] = [];
    const values: number[] = [];
    for (const k of keys) {
      const rot = k.pose[bone] ?? [0, 0, 0];
      e.set(rot[0], rot[1], rot[2], "XYZ");
      q.setFromEuler(e);
      times.push(k.t);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// Reference forward speed at which a locomotion clip's mid-stance foot speed
// equals body speed (zero slide) at timeScale 1. These are calibrated by
// measuring the clip's intrinsic peak backward foot speed (see the calibration
// in animation.test.ts); the controller then scales timeScale by speed /
// reference so the planted foot tracks the ground across the speed range.
export const RUN_REFERENCE_SPEED = 3.24;
export const SPRINT_REFERENCE_SPEED = 4.85;

export const RUN = { amplitude: 0.72, duration: 0.5 };
export const SPRINT = { amplitude: 0.92, duration: 0.46 };

function locomotionKeys(a: number, duration: number, lean: number, armPump: number): Keyframe[] {
  const kneeBent = 0.9;
  const kneeStraight = 0.12;
  const half = duration / 2;
  return [
    {
      t: 0,
      pose: {
        hipL: [a, 0, 0],
        hipR: [-a, 0, 0],
        kneeL: [kneeStraight, 0, 0],
        kneeR: [kneeBent, 0, 0],
        shoulderL: [-a * armPump, 0, 0.08],
        shoulderR: [a * armPump, 0, -0.08],
        elbowL: [0, 0, -0.5],
        elbowR: [0, 0, 0.5],
        chest: [lean, 0, 0],
      },
    },
    {
      t: half,
      pose: {
        hipL: [-a, 0, 0],
        hipR: [a, 0, 0],
        kneeL: [kneeBent, 0, 0],
        kneeR: [kneeStraight, 0, 0],
        shoulderL: [a * armPump, 0, 0.08],
        shoulderR: [-a * armPump, 0, -0.08],
        elbowL: [0, 0, -0.5],
        elbowR: [0, 0, 0.5],
        chest: [lean, 0, 0],
      },
    },
    {
      t: duration,
      pose: {
        hipL: [a, 0, 0],
        hipR: [-a, 0, 0],
        kneeL: [kneeStraight, 0, 0],
        kneeR: [kneeBent, 0, 0],
        shoulderL: [-a * armPump, 0, 0.08],
        shoulderR: [a * armPump, 0, -0.08],
        elbowL: [0, 0, -0.5],
        elbowR: [0, 0, 0.5],
        chest: [lean, 0, 0],
      },
    },
  ];
}

export function makeClips(): Record<string, THREE.AnimationClip> {
  // Idle: gentle breathing sway.
  const idle = clip("idle", 3.2, [
    { t: 0, pose: { chest: [0.02, 0, 0], shoulderL: [0, 0, 0.06], shoulderR: [0, 0, -0.06] } },
    { t: 1.6, pose: { chest: [0.06, 0, 0], shoulderL: [0, 0, 0.1], shoulderR: [0, 0, -0.1] } },
    { t: 3.2, pose: { chest: [0.02, 0, 0], shoulderL: [0, 0, 0.06], shoulderR: [0, 0, -0.06] } },
  ]);

  const run = clip("run", RUN.duration, locomotionKeys(RUN.amplitude, RUN.duration, 0.12, 0.8));
  const sprint = clip(
    "sprint",
    SPRINT.duration,
    locomotionKeys(SPRINT.amplitude, SPRINT.duration, 0.28, 1.05),
  );

  // Crouch idle and crouch walk (subtle; the body squash lowers overall height).
  const crouchIdle = clip("crouchIdle", 3.0, [
    { t: 0, pose: { chest: [0.18, 0, 0], hipL: [0.25, 0, 0], hipR: [0.25, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] } },
    { t: 1.5, pose: { chest: [0.22, 0, 0], hipL: [0.25, 0, 0], hipR: [0.25, 0, 0], kneeL: [0.42, 0, 0], kneeR: [0.42, 0, 0] } },
    { t: 3.0, pose: { chest: [0.18, 0, 0], hipL: [0.25, 0, 0], hipR: [0.25, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] } },
  ]);
  const crouchWalk = clip("crouchWalk", 0.7, [
    { t: 0, pose: { chest: [0.2, 0, 0], hipL: [0.5, 0, 0], hipR: [0.0, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.6, 0, 0] } },
    { t: 0.35, pose: { chest: [0.2, 0, 0], hipL: [0.0, 0, 0], hipR: [0.5, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.5, 0, 0] } },
    { t: 0.7, pose: { chest: [0.2, 0, 0], hipL: [0.5, 0, 0], hipR: [0.0, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.6, 0, 0] } },
  ]);

  // Jump: launch crouch, airborne spread, prepared land. T28 shortened the clip
  // from 0.9 s to 0.62 s so its landing pose tracks the retuned airtime
  // (jumpAirtime ~0.61 s at the lower 5.27 jumpSpeed); the four phase poses keep
  // their proportions (times scaled by 0.62 / 0.9) so the arc still reads as
  // crouch, spread, land-prep, touchdown, just matched to the shorter hop.
  const jump = clip("jump", 0.62, [
    { t: 0, pose: { hipL: [0.3, 0, 0], hipR: [0.3, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], chest: [0.1, 0, 0] } },
    { t: 0.12, pose: { hipL: [-0.2, 0, 0], hipR: [-0.2, 0, 0], kneeL: [0.15, 0, 0], kneeR: [0.15, 0, 0], shoulderL: [0, 0, 0.5], shoulderR: [0, 0, -0.5] } },
    { t: 0.41, pose: { hipL: [0.35, 0, 0], hipR: [-0.15, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.2, 0, 0], shoulderL: [0, 0, 0.35], shoulderR: [0, 0, -0.35] } },
    { t: 0.62, pose: { hipL: [0.3, 0, 0], hipR: [0.3, 0, 0], kneeL: [0.55, 0, 0], kneeR: [0.55, 0, 0], chest: [0.12, 0, 0] } },
  ]);

  // Build-swing: an upper-body Mattock swing. Authored on the right arm and
  // chest only so it can be made additive and layered over locomotion.
  const buildSwing = clip("buildSwing", 0.42, [
    { t: 0, pose: { shoulderR: [-0.2, 0, 0], elbowR: [0, 0, 0.4], chest: [0, -0.15, 0] } },
    { t: 0.14, pose: { shoulderR: [-1.4, 0, 0], elbowR: [0, 0, 1.0], chest: [0, -0.35, 0] } },
    { t: 0.28, pose: { shoulderR: [0.7, 0, 0], elbowR: [0, 0, 0.2], chest: [0.1, 0.2, 0] } },
    { t: 0.42, pose: { shoulderR: [-0.2, 0, 0], elbowR: [0, 0, 0.4], chest: [0, -0.15, 0] } },
  ]);

  return { idle, run, sprint, crouchIdle, crouchWalk, jump, buildSwing };
}
