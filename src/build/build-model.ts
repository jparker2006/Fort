// The authoritative build model. Holds the sparse slot -> piece map and keeps
// two derived views in lockstep with it: the instanced meshes (one pool per
// variant+material) and the collider set fed into the movement CollisionWorld.
// Placement and removal update both views incrementally, never rebuilding.

import * as THREE from "three";
import { CollisionWorld, type Box, type BoxHandle } from "../player/collision.ts";
import type { Material, Rotation, Slot, PieceType } from "./piece.ts";
import { pieceType } from "./piece.ts";
import { slotKey, slotPlacement, type SlotKey } from "./slots.ts";
import { pieceColliders } from "./colliders.ts";
import { checkPlacement, type Validity } from "./rules.ts";
import { InstancePool } from "./instance-pool.ts";
import { baseMaterial } from "./variants.ts";

/** Identifies a piece's geometry. Full pieces use their type; edits (T14) add
 * their own ids. */
export type VariantId = string;

export function fullVariant(type: PieceType): VariantId {
  return type;
}

/** Factory turning a material id into a THREE material for a pool. */
export type MaterialFactory = (material: Material) => THREE.Material;

/** Lazily creates and caches an InstancePool per (variant geometry, material). */
export class PoolRegistry {
  private readonly pools = new Map<string, InstancePool>();
  private readonly geometryFactories = new Map<VariantId, () => THREE.BufferGeometry>();
  onPoolCreated?: (pool: InstancePool) => void;

  // Defaults to the flat, Node-safe material; the browser injects the
  // procedural wood/stone/metal factory (T11).
  constructor(
    private readonly scene: THREE.Scene,
    private readonly materialFactory: MaterialFactory = baseMaterial,
  ) {}

  /** Register the geometry factory for a variant id (called once per variant). */
  registerVariant(id: VariantId, factory: () => THREE.BufferGeometry): void {
    this.geometryFactories.set(id, factory);
  }

  pool(variant: VariantId, material: Material): InstancePool {
    const key = `${variant}:${material}`;
    let pool = this.pools.get(key);
    if (!pool) {
      const factory = this.geometryFactories.get(variant);
      if (!factory) throw new Error(`No geometry registered for variant "${variant}"`);
      pool = new InstancePool(this.scene, factory(), this.materialFactory(material));
      this.pools.set(key, pool);
      this.onPoolCreated?.(pool);
    }
    return pool;
  }

  /** Number of live pools; equals the build-piece draw call count. */
  get poolCount(): number {
    return this.pools.size;
  }

  meshes(): THREE.InstancedMesh[] {
    return [...this.pools.values()].map((p) => p.mesh);
  }

  dispose(): void {
    for (const p of this.pools.values()) p.dispose();
    this.pools.clear();
  }
}

interface StoredPiece {
  slot: Slot;
  material: Material;
  rotation: Rotation;
  variant: VariantId;
  poolKey: string;
  instanceIndex: number;
  colliders: BoxHandle[];
}

export interface PlaceOptions {
  material?: Material;
  rotation?: Rotation;
  /** Reject if the piece's colliders would intersect this player AABB. */
  playerBox?: Box;
}

export class BuildModel {
  private readonly pieces = new Map<SlotKey, StoredPiece>();
  // Per pool, the slot key living at each instance index, for swap bookkeeping.
  private readonly poolSlots = new Map<string, SlotKey[]>();
  private readonly scratch = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly pools: PoolRegistry,
    private readonly collision: CollisionWorld,
  ) {}

  private occupied = (key: SlotKey): boolean => this.pieces.has(key);

  /** Full validity check (occupancy, bounds, support, optional player overlap). */
  canPlace(slot: Slot, opts: PlaceOptions = {}): Validity {
    const base = checkPlacement(slot, this.occupied);
    if (!base.ok) return base;
    if (opts.playerBox && this.intersectsPlayer(slot, opts.rotation ?? 0, opts.playerBox)) {
      return { ok: false, reason: "occupied" };
    }
    return { ok: true };
  }

  private intersectsPlayer(slot: Slot, rotation: Rotation, player: Box): boolean {
    for (const b of pieceColliders(slot, rotation)) {
      if (
        b.minX < player.maxX && b.maxX > player.minX &&
        b.minY < player.maxY && b.maxY > player.minY &&
        b.minZ < player.maxZ && b.maxZ > player.minZ
      ) {
        return true;
      }
    }
    return false;
  }

  /** Place a piece if valid. Returns true on success. */
  place(slot: Slot, opts: PlaceOptions = {}): boolean {
    if (!this.canPlace(slot, opts).ok) return false;
    const material = opts.material ?? "wood";
    const rotation = opts.rotation ?? 0;
    const type = pieceType(slot);
    const variant = fullVariant(type);
    const pool = this.pools.pool(variant, material);
    const poolKey = `${variant}:${material}`;

    // Instance matrix from the slot placement.
    const p = slotPlacement(slot, rotation);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    this.pos.set(p.x, p.y, p.z);
    this.scratch.compose(this.pos, this.q, this.scl);
    const instanceIndex = pool.add(this.scratch);

    // Colliders into the movement world.
    const colliders = pieceColliders(slot, rotation).map((b) => this.collision.add(b));

    const key = slotKey(slot);
    this.pieces.set(key, {
      slot, material, rotation, variant, poolKey, instanceIndex, colliders,
    });
    this.slotsFor(poolKey)[instanceIndex] = key;
    return true;
  }

  /** Remove the piece at a slot. Returns true if one was there. */
  removeAt(slot: Slot): boolean {
    const key = slotKey(slot);
    const piece = this.pieces.get(key);
    if (!piece) return false;

    // Free colliders.
    for (const h of piece.colliders) this.collision.remove(h);

    // Swap-remove the instance; fix up whichever slot moved into the hole.
    const pool = this.pools.pool(piece.variant, piece.material);
    const slots = this.slotsFor(piece.poolKey);
    const moved = pool.removeSwap(piece.instanceIndex);
    if (moved >= 0) {
      const movedKey = slots[moved]!;
      slots[piece.instanceIndex] = movedKey;
      const movedPiece = this.pieces.get(movedKey);
      if (movedPiece) movedPiece.instanceIndex = piece.instanceIndex;
    }
    slots.pop();

    this.pieces.delete(key);
    return true;
  }

  has(slot: Slot): boolean {
    return this.pieces.has(slotKey(slot));
  }

  get(slot: Slot): StoredPiece | undefined {
    return this.pieces.get(slotKey(slot));
  }

  get count(): number {
    return this.pieces.size;
  }

  /** Live draw call count for build pieces (one per active pool). */
  get poolCount(): number {
    return this.pools.poolCount;
  }

  private slotsFor(poolKey: string): SlotKey[] {
    let arr = this.poolSlots.get(poolKey);
    if (!arr) {
      arr = [];
      this.poolSlots.set(poolKey, arr);
    }
    return arr;
  }
}
