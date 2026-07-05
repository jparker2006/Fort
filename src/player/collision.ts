// Axis-aligned collision world. The build world is grid-aligned boxes, so
// modeling the player as an AABB against static AABBs is stable (no physics
// explosions) and cheap. T09 feeds the real build-piece colliders in here;
// T06 uses it for ground plus debug boxes.
//
// T20: boxes are indexed in a 2D (X,Z) spatial hash so movement queries only the
// handful of boxes near the player instead of every box in the world. `near`
// fills a caller-owned array (no per-query allocation) and dedupes with a reused
// visited set, keeping the movement hot path O(nearby) even with 600+ pieces.

import { CELL_SIZE } from "../world/grid.ts";

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface BoxHandle {
  readonly id: number;
}

export function makeBox(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): Box {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  return {
    minX: cx - hx,
    minY: cy - hy,
    minZ: cz - hz,
    maxX: cx + hx,
    maxY: cy + hy,
    maxZ: cz + hz,
  };
}

/** Spatial-hash cell size in world units (2 build cells). */
export const BUCKET = 2 * CELL_SIZE;

function bucketIndex(v: number): number {
  return Math.floor(v / BUCKET);
}

export class CollisionWorld {
  private readonly map = new Map<number, Box>();
  private readonly buckets = new Map<number, Map<number, Box>>();
  private nextId = 1;

  // Reused scratch for near(): a visited set keyed by box id, so a box spanning
  // several buckets is returned once without allocating per query.
  private readonly visited = new Set<number>();
  private lastComparisons = 0;

  add(box: Box): BoxHandle {
    const id = this.nextId++;
    this.map.set(id, box);
    this.forEachCell(box, (key) => {
      let cell = this.buckets.get(key);
      if (!cell) {
        cell = new Map();
        this.buckets.set(key, cell);
      }
      cell.set(id, box);
    });
    return { id };
  }

  remove(handle: BoxHandle): void {
    const box = this.map.get(handle.id);
    if (!box) return;
    this.map.delete(handle.id);
    this.forEachCell(box, (key) => {
      const cell = this.buckets.get(key);
      if (cell) {
        cell.delete(handle.id);
        if (cell.size === 0) this.buckets.delete(key);
      }
    });
  }

  clear(): void {
    this.map.clear();
    this.buckets.clear();
  }

  get count(): number {
    return this.map.size;
  }

  /** Boxes whose bucket overlaps the query box, appended to `out` (which is
   * cleared first). O(nearby), not O(all). */
  near(query: Box, out: Box[]): Box[] {
    out.length = 0;
    this.visited.clear();
    let comparisons = 0;
    const x0 = bucketIndex(query.minX);
    const x1 = bucketIndex(query.maxX);
    const z0 = bucketIndex(query.minZ);
    const z1 = bucketIndex(query.maxZ);
    for (let bx = x0; bx <= x1; bx++) {
      for (let bz = z0; bz <= z1; bz++) {
        const cell = this.buckets.get(cellKey(bx, bz));
        if (!cell) continue;
        for (const [id, box] of cell) {
          comparisons++;
          if (this.visited.has(id)) continue;
          this.visited.add(id);
          out.push(box);
        }
      }
    }
    this.lastComparisons = comparisons;
    return out;
  }

  /** Boxes examined by the last near() call (perf test helper). */
  get lastNearComparisons(): number {
    return this.lastComparisons;
  }

  /** All boxes. Used by tests and non-hot paths; movement uses near(). */
  all(): Iterable<Box> {
    return this.map.values();
  }

  private forEachCell(box: Box, fn: (key: number) => void): void {
    const x0 = bucketIndex(box.minX);
    const x1 = bucketIndex(box.maxX);
    const z0 = bucketIndex(box.minZ);
    const z1 = bucketIndex(box.maxZ);
    for (let bx = x0; bx <= x1; bx++) {
      for (let bz = z0; bz <= z1; bz++) fn(cellKey(bx, bz));
    }
  }
}

// Pack two signed bucket indices into one number key (offset to stay positive).
function cellKey(bx: number, bz: number): number {
  return (bx + 4096) * 8192 + (bz + 4096);
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}
