// The authoritative build model. Holds the sparse slot -> piece map and keeps
// two derived views in lockstep with it: the instanced meshes (one pool per
// variant+material) and the collider set fed into the movement CollisionWorld.
// Placement and removal update both views incrementally, never rebuilding.

import * as THREE from "three";
import { CollisionWorld, type Box, type BoxHandle } from "../player/collision.ts";
import type { Material, Rotation, Slot, PieceType } from "./piece.ts";
import { pieceType } from "./piece.ts";
import { slotKey, decodeSlotKey, slotPlacement, type SlotKey } from "./slots.ts";
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

  // Fallback geometry factory for variants not explicitly registered (edit
  // variants, T14): resolves geometry from the variant id on first use.
  private variantResolver?: (id: VariantId) => THREE.BufferGeometry | null;

  /** Register the geometry factory for a variant id (called once per variant). */
  registerVariant(id: VariantId, factory: () => THREE.BufferGeometry): void {
    this.geometryFactories.set(id, factory);
  }

  /** Resolver that builds geometry for any unregistered variant id on demand. */
  setVariantResolver(fn: (id: VariantId) => THREE.BufferGeometry | null): void {
    this.variantResolver = fn;
  }

  pool(variant: VariantId, material: Material): InstancePool {
    const key = `${variant}:${material}`;
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new InstancePool(this.scene, key, this.resolveGeometry(variant), this.materialFactory(material));
      this.pools.set(key, pool);
      this.onPoolCreated?.(pool);
    }
    return pool;
  }

  private resolveGeometry(variant: VariantId): THREE.BufferGeometry {
    const factory = this.geometryFactories.get(variant);
    if (factory) return factory();
    const resolved = this.variantResolver?.(variant);
    if (resolved) return resolved;
    throw new Error(`No geometry registered for variant "${variant}"`);
  }

  /** Number of live pools; equals the build-piece draw call count. */
  get poolCount(): number {
    return this.pools.size;
  }

  /** Total reallocations across all pools (perf test helper; 0 == pre-warmed). */
  get totalGrows(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.growCount;
    return n;
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
  hp: number;
}

// Material-scaled hit points, tuned so wood breaks in 2 Mattock swings (like
// Fortnite's pickaxe vs. fresh wood) with stone and metal progressively tougher.
const MATERIAL_HP: Record<Material, number> = { wood: 2, stone: 3, metal: 5 };

export function hitPointsFor(material: Material): number {
  return MATERIAL_HP[material];
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
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly pools: PoolRegistry,
    private readonly collision: CollisionWorld,
    // Colliders for a variant; defaults to the full-piece colliders. T14 injects
    // per-edit-variant collider sets so edited geometry and collision agree.
    private readonly variantColliders: (slot: Slot, rotation: Rotation, variant: VariantId) => Box[] =
      (slot, rotation) => pieceColliders(slot, rotation),
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
    const variant = fullVariant(pieceType(slot));

    const key = slotKey(slot);
    const attached = this.attachInstance(key, slot, material, rotation, variant);
    this.pieces.set(key, {
      slot, material, rotation, hp: MATERIAL_HP[material], ...attached,
    });
    return true;
  }

  /**
   * Swap a placed piece to a new edit variant, moving its instance to the
   * variant's pool and re-deriving its colliders. Material, rotation, slot, and
   * hit points are preserved. Returns false if nothing is there. (Full T14 use;
   * T13 confirm calls this with the resolved variant.)
   */
  applyEdit(slot: Slot, variant: VariantId, rotation?: Rotation): boolean {
    const key = slotKey(slot);
    const piece = this.pieces.get(key);
    if (!piece) return false;
    const newRot = rotation ?? piece.rotation;
    if (piece.variant === variant && piece.rotation === newRot) return true;
    this.detachInstance(piece);
    piece.rotation = newRot;
    const attached = this.attachInstance(key, slot, piece.material, newRot, variant);
    piece.variant = attached.variant;
    piece.poolKey = attached.poolKey;
    piece.instanceIndex = attached.instanceIndex;
    piece.colliders = attached.colliders;
    return true;
  }

  /** The current edit variant at a slot (or undefined). */
  variantAt(slot: Slot): VariantId | undefined {
    return this.pieces.get(slotKey(slot))?.variant;
  }

  /** Visit every placed piece's slot and material (for the minimap). */
  forEachMapPiece(cb: (slot: Slot, material: Material) => void): void {
    for (const p of this.pieces.values()) cb(p.slot, p.material);
  }

  // Add an instance for (variant, material) at the slot placement and register
  // its colliders. Returns the pool bookkeeping for the caller to store.
  private attachInstance(
    key: SlotKey,
    slot: Slot,
    material: Material,
    rotation: Rotation,
    variant: VariantId,
  ): { variant: VariantId; poolKey: string; instanceIndex: number; colliders: BoxHandle[] } {
    const pool = this.pools.pool(variant, material);
    const poolKey = `${variant}:${material}`;
    const p = slotPlacement(slot, rotation);
    this.q.setFromAxisAngle(this.yAxis, p.rotY);
    this.pos.set(p.x, p.y, p.z);
    this.scratch.compose(this.pos, this.q, this.scl);
    const instanceIndex = pool.add(this.scratch);
    const colliders = this.variantColliders(slot, rotation, variant).map((b) => this.collision.add(b));
    this.slotsFor(poolKey)[instanceIndex] = key;
    return { variant, poolKey, instanceIndex, colliders };
  }

  // Remove a piece's instance (swap-remove, fixing bookkeeping) and free its
  // colliders, without deleting the piece record.
  private detachInstance(piece: StoredPiece): void {
    for (const h of piece.colliders) this.collision.remove(h);
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
  }

  /** Apply Mattock damage to a piece; destroys it when hit points reach zero. */
  damageAt(slot: Slot, amount = 1): "destroyed" | "damaged" | "none" {
    const piece = this.pieces.get(slotKey(slot));
    if (!piece) return "none";
    piece.hp -= amount;
    if (piece.hp <= 0) {
      this.removeAt(slot);
      return "destroyed";
    }
    return "damaged";
  }

  /**
   * Nearest build piece the ray hits within maxDistance, or null. Raycasts the
   * instanced pool meshes (sorted near-to-far, so occluded pieces are never
   * returned) and maps the hit instance back to its slot. The island ground is
   * not a pool, so it is never destructible.
   */
  raycastPiece(
    raycaster: THREE.Raycaster,
    maxDistance: number,
  ): { key: SlotKey; slot: Slot; distance: number } | null {
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(this.pools.meshes(), false);
    for (const h of hits) {
      if (h.instanceId == null) continue;
      const poolId = h.object.userData.poolId as string | undefined;
      if (!poolId) continue;
      const key = this.poolSlots.get(poolId)?.[h.instanceId];
      if (key && this.pieces.has(key)) {
        return { key, slot: decodeSlotKey(key), distance: h.distance };
      }
    }
    return null;
  }

  /** Remaining hit points at a slot (test/HUD helper). */
  hpAt(slot: Slot): number {
    return this.pieces.get(slotKey(slot))?.hp ?? 0;
  }

  /** Remove the piece at a slot. Returns true if one was there. */
  removeAt(slot: Slot): boolean {
    const key = slotKey(slot);
    const piece = this.pieces.get(key);
    if (!piece) return false;
    this.detachInstance(piece);
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

  /** Total pool reallocations (perf test helper; 0 == pre-warmed). */
  get totalGrows(): number {
    return this.pools.totalGrows;
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
