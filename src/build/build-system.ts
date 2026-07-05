// The build System: owns the pool registry and BuildModel, registers the four
// base piece geometries, and wires build-piece meshes into the scene (and into
// the camera spring arm so it never clips through builds). T09 exposes only a
// debug placement API; input-driven targeting and placement arrive in T10/T11.

import type { Game, System } from "../core/game.ts";
import type { CollisionWorld } from "../player/collision.ts";
import type { InstancePool } from "./instance-pool.ts";
import { PoolRegistry, BuildModel, fullVariant, type PlaceOptions } from "./build-model.ts";
import { baseGeometry } from "./variants.ts";
import { PIECE_TYPES, MATERIALS, type Material, type Rotation, type Slot } from "./piece.ts";
import { CELL_MIN, CELL_MAX } from "../world/grid.ts";
import { wallOnEdge, floorSlot, stairsSlot, roofSlot } from "./slots.ts";
import type { Validity } from "./rules.ts";

export class BuildSystem implements System {
  readonly name = "build";
  readonly registry: PoolRegistry;
  readonly model: BuildModel;

  /** Deterministic PRNG state for the debug scatter (no Math.random). */
  private seed = 0x2545f491;

  constructor(
    scene: import("three").Scene,
    private readonly collision: CollisionWorld,
    onPoolCreated?: (pool: InstancePool) => void,
  ) {
    this.registry = new PoolRegistry(scene);
    if (onPoolCreated) this.registry.onPoolCreated = onPoolCreated;
    for (const type of PIECE_TYPES) {
      this.registry.registerVariant(fullVariant(type), () => baseGeometry(type));
    }
    this.model = new BuildModel(this.registry, this.collision);
  }

  init(_game: Game): void {
    // No per-frame work yet; targeting/placement systems drive the model later.
    void _game;
  }

  place(slot: Slot, opts: PlaceOptions = {}): boolean {
    return this.model.place(slot, opts);
  }

  canPlace(slot: Slot, opts: PlaceOptions = {}): Validity {
    return this.model.canPlace(slot, opts);
  }

  remove(slot: Slot): boolean {
    return this.model.removeAt(slot);
  }

  get count(): number {
    return this.model.count;
  }

  get drawCalls(): number {
    return this.model.poolCount;
  }

  private rand(): number {
    // xorshift32, deterministic across runs for reproducible debug scenes.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0xffffffff;
  }

  /**
   * Debug helper: scatter up to `n` valid pieces of mixed type/material/rotation
   * across the ground level. Ground pieces are always supported, so this fills
   * quickly and exercises every pool. Returns the number actually placed.
   */
  debugScatter(n: number): number {
    const span = CELL_MAX - CELL_MIN + 1;
    let placed = 0;
    let attempts = 0;
    const maxAttempts = n * 20;
    while (placed < n && attempts < maxAttempts) {
      attempts += 1;
      const cx = CELL_MIN + Math.floor(this.rand() * span);
      const cz = CELL_MIN + Math.floor(this.rand() * span);
      const material = MATERIALS[Math.floor(this.rand() * MATERIALS.length)]!;
      const rotation = Math.floor(this.rand() * 4) as Rotation;
      const slot = this.randomSlot(cx, cz);
      if (this.model.place(slot, { material, rotation })) placed += 1;
    }
    return placed;
  }

  private randomSlot(cx: number, cz: number): Slot {
    const pick = Math.floor(this.rand() * 4);
    switch (pick) {
      case 0:
        return wallOnEdge(cx, 0, cz, this.rand() < 0.5 ? "W" : "S");
      case 1:
        return floorSlot(cx, 0, cz);
      case 2:
        return stairsSlot(cx, 0, cz);
      default:
        return roofSlot(cx, 0, cz);
    }
  }

  dispose(): void {
    this.registry.dispose();
  }
}

export { type Material, type Rotation, type Slot };
