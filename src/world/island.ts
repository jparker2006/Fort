import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import {
  CELL_SIZE,
  ISLAND_HALF,
  ISLAND_SIZE,
  CELL_MIN,
  CELL_MAX,
} from "./grid.ts";
import { makeGrassTexture } from "./textures.ts";
import { makeSky } from "./sky.ts";

// The creative island: flat buildable ground, a build-grid overlay aligned to
// the cell lattice, a procedural sky with sun, a surrounding water ring and
// distant hills, and hemisphere plus directional lighting with soft shadows.

export class World implements System {
  readonly name = "world";
  readonly sunDirection = new THREE.Vector3();

  private readonly group = new THREE.Group();
  private disposables: Array<{ dispose: () => void }> = [];

  init(game: Game): void {
    game.scene.add(this.group);
    this.buildSky(game);
    this.buildLighting(game);
    this.buildGround();
    this.buildGridOverlay();
    this.buildWaterRing();
    this.buildDistantHills();
  }

  private track<T extends { dispose: () => void }>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }

  private buildSky(game: Game): void {
    const sky = makeSky();
    this.sunDirection.copy(sky.sunDirection);
    this.group.add(sky.mesh);
    this.track(sky.mesh.geometry);
    this.track(sky.mesh.material as THREE.Material);
    // Subtle fog blends the island edge into the horizon haze.
    game.scene.fog = new THREE.Fog(0xbfe4ec, ISLAND_HALF * 1.4, ISLAND_HALF * 4.5);
  }

  private buildLighting(game: Game): void {
    const hemi = new THREE.HemisphereLight(0xdfeffb, 0x3a5233, 0.9);
    game.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2cc, 2.1);
    sun.position.copy(this.sunDirection).multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.near = 1;
    cam.far = 400;
    cam.left = -ISLAND_HALF;
    cam.right = ISLAND_HALF;
    cam.top = ISLAND_HALF;
    cam.bottom = -ISLAND_HALF;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    game.scene.add(sun);
    game.scene.add(sun.target);
  }

  private buildGround(): void {
    const grass = this.track(makeGrassTexture());
    // One texture tile per two cells keeps blades at a readable scale.
    grass.repeat.set(ISLAND_SIZE / (CELL_SIZE * 2), ISLAND_SIZE / (CELL_SIZE * 2));

    const geo = this.track(new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE));
    geo.rotateX(-Math.PI / 2);
    const mat = this.track(
      new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95, metalness: 0 }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "ground";
    this.group.add(mesh);
  }

  private buildGridOverlay(): void {
    // Lines exactly on cell boundaries, from CELL_MIN to CELL_MAX + 1.
    const positions: number[] = [];
    const y = 0.02; // lift slightly to avoid z-fighting with the ground
    for (let c = CELL_MIN; c <= CELL_MAX + 1; c++) {
      const p = c * CELL_SIZE;
      // Line parallel to Z.
      positions.push(p, y, -ISLAND_HALF, p, y, ISLAND_HALF);
      // Line parallel to X.
      positions.push(-ISLAND_HALF, y, p, ISLAND_HALF, y, p);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = this.track(
      new THREE.LineBasicMaterial({ color: 0x8fdede, transparent: true, opacity: 0.22 }),
    );
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = "build-grid";
    this.group.add(lines);
  }

  private buildWaterRing(): void {
    // A large disc under the island edge, a touch below ground level.
    const geo = this.track(new THREE.CircleGeometry(ISLAND_HALF * 4, 64));
    geo.rotateX(-Math.PI / 2);
    const mat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x2b6f86,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -1.2;
    mesh.name = "water";
    this.group.add(mesh);
  }

  private buildDistantHills(): void {
    // Low-poly hills in a ring beyond the water, purely decorative backdrop.
    const geo = this.track(new THREE.ConeGeometry(1, 1, 5));
    const mat = this.track(new THREE.MeshStandardMaterial({ color: 0x50694a, flatShading: true }));
    const count = 26;
    const hills = new THREE.InstancedMesh(geo, mat, count);
    hills.name = "distant-hills";
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (i % 3) * 0.11;
      const dist = ISLAND_HALF * 2.6 + (i % 5) * 14;
      const s = 26 + (i % 4) * 12;
      pos.set(Math.cos(ang) * dist, s * 0.5 - 2, Math.sin(ang) * dist);
      scale.set(s * (0.8 + (i % 3) * 0.2), s, s * (0.8 + (i % 2) * 0.3));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      m.compose(pos, q, scale);
      hills.setMatrixAt(i, m);
    }
    hills.instanceMatrix.needsUpdate = true;
    this.group.add(hills);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.removeFromParent();
  }
}
