// One InstancedMesh per (variant geometry, material) pair. Placing a piece sets
// an instance matrix; removing swaps the last instance into the freed slot and
// shrinks the count, so instances stay packed and no draw call is ever added or
// removed while pieces churn. Capacity grows by reallocation only when exceeded.

import * as THREE from "three";

const INITIAL_CAPACITY = 64;

export class InstancePool {
  mesh: THREE.InstancedMesh;
  private capacity: number;
  private count = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly id: string,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    initialCapacity = INITIAL_CAPACITY,
  ) {
    this.capacity = initialCapacity;
    this.mesh = this.makeMesh(this.capacity);
    this.scene.add(this.mesh);
  }

  private makeMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.count = this.count;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Stamp the pool id so a raycast hit maps back to the owning pool (and, with
    // the instanceId, to the placed slot) even after a grow swaps the mesh.
    mesh.userData.poolId = this.id;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // A frustum cull on the shared bounding sphere would drop the whole batch;
    // pieces span the island, so keep the batch always drawn (T20 tightens this).
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Append an instance; returns its index. Grows capacity if needed. */
  add(matrix: THREE.Matrix4): number {
    if (this.count >= this.capacity) this.grow();
    const index = this.count;
    this.mesh.setMatrixAt(index, matrix);
    this.count += 1;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return index;
  }

  /** Overwrite an existing instance's matrix (used when an edit re-poses it). */
  setMatrix(index: number, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(index, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Remove the instance at `index` by swapping the last instance into its place.
   * Returns the old index of the moved instance (so the model can fix its
   * bookkeeping), or -1 when the removed instance was already the last one.
   */
  removeSwap(index: number): number {
    const last = this.count - 1;
    let moved = -1;
    if (index !== last) {
      const m = new THREE.Matrix4();
      this.mesh.getMatrixAt(last, m);
      this.mesh.setMatrixAt(index, m);
      moved = last;
    }
    this.count -= 1;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return moved;
  }

  private grow(): void {
    const bigger = this.capacity * 2;
    const next = this.makeMesh(bigger);
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, m);
      next.setMatrixAt(i, m);
    }
    next.count = this.count;
    next.instanceMatrix.needsUpdate = true;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = next;
    this.scene.add(this.mesh);
    this.capacity = bigger;
  }

  get size(): number {
    return this.count;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
