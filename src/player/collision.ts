// Axis-aligned collision world. The build world is grid-aligned boxes, so
// modeling the player as an AABB against static AABBs is stable (no physics
// explosions) and cheap. T09 feeds the real build-piece colliders in here;
// T06 uses it for ground plus debug boxes.

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

export class CollisionWorld {
  private readonly map = new Map<number, Box>();
  private nextId = 1;

  add(box: Box): BoxHandle {
    const id = this.nextId++;
    this.map.set(id, box);
    return { id };
  }

  remove(handle: BoxHandle): void {
    this.map.delete(handle.id);
  }

  clear(): void {
    this.map.clear();
  }

  get count(): number {
    return this.map.size;
  }

  /** All boxes. T20 replaces this with a spatial-hash near-query for perf. */
  all(): Iterable<Box> {
    return this.map.values();
  }
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
