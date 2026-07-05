// Break and hit effects: an original spark burst rendered as a single additive
// THREE.Points cloud with a fixed-capacity ring buffer of particles. Because
// bursts overwrite the oldest slots, the live particle count is hard-bounded by
// CAPACITY no matter how many breaks occur, so there is no leak. Additive
// blending means a particle fading to black fades to invisible.

import * as THREE from "three";

const CAPACITY = 256;
const GRAVITY = 9.0;

export type Tint = readonly [number, number, number];

export class BreakEffects {
  private readonly points: THREE.Points;
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly colors = new Float32Array(CAPACITY * 3);
  private readonly baseColor = new Float32Array(CAPACITY * 3);
  private readonly vel = new Float32Array(CAPACITY * 3);
  private readonly life = new Float32Array(CAPACITY);
  private readonly maxLife = new Float32Array(CAPACITY);
  private head = 0;
  // Deterministic PRNG so bursts are stable across runs.
  private seed = 0x1234_abcd;

  constructor(private readonly scene: THREE.Scene) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    // Park every particle far below the world until it is used.
    for (let i = 0; i < CAPACITY; i++) this.positions[i * 3 + 1] = -1000;
    const material = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geom, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
    this.scene.add(this.points);
  }

  private rand(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0xffffffff;
  }

  /** Emit `n` sparks at a point, tinted by the broken material. */
  burst(x: number, y: number, z: number, tint: Tint, n: number, speed: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % CAPACITY;
      const p = i * 3;
      this.positions[p] = x;
      this.positions[p + 1] = y;
      this.positions[p + 2] = z;
      // Random outward velocity, biased upward.
      const dirX = this.rand() * 2 - 1;
      const dirY = this.rand() * 1.2 + 0.2;
      const dirZ = this.rand() * 2 - 1;
      const s = speed * (0.5 + this.rand());
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      this.vel[p] = (dirX / len) * s;
      this.vel[p + 1] = (dirY / len) * s;
      this.vel[p + 2] = (dirZ / len) * s;
      this.baseColor[p] = tint[0];
      this.baseColor[p + 1] = tint[1];
      this.baseColor[p + 2] = tint[2];
      this.colors[p] = tint[0];
      this.colors[p + 1] = tint[1];
      this.colors[p + 2] = tint[2];
      const life = 0.35 + this.rand() * 0.35;
      this.life[i] = life;
      this.maxLife[i] = life;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i]! <= 0) continue;
      const p = i * 3;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        // Retire: park it and blacken (invisible under additive blending).
        this.positions[p + 1] = -1000;
        this.colors[p] = this.colors[p + 1] = this.colors[p + 2] = 0;
        continue;
      }
      this.vel[p + 1]! -= GRAVITY * dt;
      this.positions[p]! += this.vel[p]! * dt;
      this.positions[p + 1]! += this.vel[p + 1]! * dt;
      this.positions[p + 2]! += this.vel[p + 2]! * dt;
      const t = this.life[i]! / this.maxLife[i]!; // 1 -> 0 fade
      this.colors[p] = this.baseColor[p]! * t;
      this.colors[p + 1] = this.baseColor[p + 1]! * t;
      this.colors[p + 2] = this.baseColor[p + 2]! * t;
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Number of currently live particles (bounded by CAPACITY; test helper). */
  liveCount(): number {
    let n = 0;
    for (let i = 0; i < CAPACITY; i++) if (this.life[i]! > 0) n++;
    return n;
  }

  get capacity(): number {
    return CAPACITY;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Original spark tints per build material. */
export const MATERIAL_TINT: Record<string, Tint> = {
  wood: [0.85, 0.6, 0.35],
  stone: [0.8, 0.82, 0.88],
  metal: [0.7, 0.85, 1.0],
};
