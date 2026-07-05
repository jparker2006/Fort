import "./style.css";
import * as THREE from "three";
import { Game, type System } from "./core/game.ts";
import { World } from "./world/island.ts";
import { InputSystem } from "./input/input-system.ts";
import { DebugInputOverlay } from "./input/debug-input-overlay.ts";
import { Player } from "./player/player.ts";
import { CameraRig } from "./player/camera-rig.ts";
import { makeBox } from "./player/collision.ts";
import { BuildSystem } from "./build/build-system.ts";
import { BuildController, type BuildMode } from "./build/build-controller.ts";
import { DestroyController } from "./build/destroy-controller.ts";
import { makeBuildMaterial } from "./build/materials.ts";
import { wallOnEdge, floorSlot, stairsSlot, roofSlot, slotKey, decodeSlotKey } from "./build/slots.ts";
import type { Material, Rotation, PieceType } from "./build/piece.ts";
import { bootTurntable } from "./character/turntable.ts";

// Island, input, player (original hero), and the third-person camera rig.
// The ?turntable query param launches the character review scene instead.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

if (new URLSearchParams(location.search).has("turntable")) {
  bootTurntable(app);
} else {
  bootGame(app);
}

function bootGame(app: HTMLElement): void {
const game = new Game({ parent: app });

const input = new InputSystem();
input.setEnabled(true); // T18 gates this behind pointer lock; on for early review
game.add(input);
game.add(new World());

const player = new Player(input);
game.add(player);

const cameraRig = new CameraRig(input, player);
game.add(cameraRig);

// Movement is camera-relative: feed the camera yaw to the player.
player.setYawSource(() => cameraRig.yaw);

// The spring arm collides against the ground so the camera never dips below it.
const ground = game.scene.getObjectByName("ground");
if (ground) cameraRig.addCollider(ground);

// Build system: pool meshes join the camera spring-arm colliders as they are
// created so the camera never clips through placed pieces.
const build = new BuildSystem(
  game.scene,
  player.collision,
  (pool) => cameraRig.addCollider(pool.mesh),
  makeBuildMaterial,
);
game.add(build);

// Build-mode targeting and ghost preview. Added after the camera rig so its
// per-frame update reads the freshly integrated aim ray.
const buildController = new BuildController(input, cameraRig, player, build.model);
game.add(buildController);

// Mattock destroy mode: swings when the controller's mode is "mattock".
const destroyController = new DestroyController(
  input,
  cameraRig,
  player,
  build.model,
  () => buildController.getMode(),
);
game.add(destroyController);

// Live action-state overlay (toggle with Backslash).
const inputOverlay = new DebugInputOverlay(app, input);
game.add({ name: "input-overlay", update: () => inputOverlay.update() } satisfies System);

game.start();

// Debug helpers for verification: place a collidable box, and read the aim ray
// hit on the ground plane.
const debug = {
  placeBox(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xb06a3a }),
    );
    box.position.set(x, y, z);
    box.name = "debug-box";
    game.scene.add(box);
    cameraRig.addCollider(box);
  },
  // Place a solid collision box (mesh + collider + camera collider). Center at
  // (x,y,z), size (w,h,d). Used to test jump-onto, step-up, and blocking.
  placeSolid(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x9a7b53 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    game.scene.add(mesh);
    player.collision.add(makeBox(x, y, z, w, h, d));
    cameraRig.addCollider(mesh);
  },
  playerPos(): { x: number; y: number; z: number } {
    return { x: player.state.position.x, y: player.state.position.y, z: player.state.position.z };
  },
  onGround(): boolean {
    return player.state.onGround;
  },
  teleport(x: number, y: number, z: number): void {
    player.state.position.set(x, y, z);
    player.state.velocity.set(0, 0, 0);
    player.state.onGround = y <= 0;
  },
  setYaw(yaw: number): void {
    cameraRig.yaw = yaw;
  },
  setPitch(pitch: number): void {
    cameraRig.pitch = pitch;
  },
  aimGroundHit(): { x: number; z: number } | null {
    const ray = cameraRig.getAimRay();
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  },
  // Advance the engine deterministically (headless browsers throttle rAF).
  pump(frames = 1): void {
    for (let i = 0; i < frames; i++) game.stepForTest();
  },
  setAimMode(v: boolean): void {
    player.aimMode = v;
  },
  buildSwing(): void {
    player.triggerBuildSwing();
  },
  animState(): string {
    return player.animState;
  },
  bodyYaw(): number {
    return player.state.yaw;
  },
  boneRotX(name: string): number {
    const b = player.getHero().bones.get(name);
    return b ? b.rotation.x : 0;
  },
  // Build model helpers (T09): place pieces by cell address and inspect state.
  build: {
    wall(cx: number, cy: number, cz: number, dir: "N" | "S" | "E" | "W", opts: BuildDebugOpts = {}): boolean {
      return build.place(wallOnEdge(cx, cy, cz, dir), opts);
    },
    floor(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(floorSlot(cx, cy, cz), opts);
    },
    stairs(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(stairsSlot(cx, cy, cz), opts);
    },
    roof(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(roofSlot(cx, cy, cz), opts);
    },
    removeFloor(cx: number, cy: number, cz: number): boolean {
      return build.remove(floorSlot(cx, cy, cz));
    },
    scatter(n: number): number {
      return build.debugScatter(n);
    },
    placeSlotKey(key: string, opts: BuildDebugOpts = {}): boolean {
      return build.place(decodeSlotKey(key), opts);
    },
    materialAt(key: string): Material | null {
      return build.model.get(decodeSlotKey(key))?.material ?? null;
    },
    hpAt(key: string): number {
      return build.model.hpAt(decodeSlotKey(key));
    },
    count(): number {
      return build.count;
    },
    drawCalls(): number {
      return build.drawCalls;
    },
    colliderCount(): number {
      return player.collision.count;
    },
    rendererDrawCalls(): number {
      return game.renderer.info.render.calls;
    },
  },
  // Build-mode targeting/ghost/placement (T10, T11).
  target: {
    setActive(v: boolean): void {
      buildController.setActive(v);
    },
    setMode(m: BuildMode): void {
      buildController.setMode(m);
    },
    mode(): BuildMode {
      return buildController.getMode();
    },
    setPiece(type: PieceType): void {
      buildController.setPieceType(type);
    },
    piece(): PieceType {
      return buildController.getPieceType();
    },
    cycleRotation(): void {
      buildController.cycleRotation();
    },
    cycleMaterial(): void {
      buildController.cycleMaterial();
    },
    material(): Material {
      return buildController.getMaterial();
    },
    setTurbo(on: boolean): void {
      buildController.gameplay.turboBuild = on;
    },
    info(): { key: string | null; rotation: number | null; valid: boolean; ghost: string } {
      const t = buildController.getTarget();
      return {
        key: t ? slotKey(t.slot) : null,
        rotation: t ? t.rotation : null,
        valid: buildController.isValid(),
        ghost: buildController.ghostColorState(),
      };
    },
  },
  // Mattock destroy mode (T12).
  destroy: {
    swing(): string {
      return destroyController.swing();
    },
    liveParticles(): number {
      return destroyController.liveParticles();
    },
    burst(n: number): void {
      destroyController.debugBurst(n);
    },
  },
};

interface BuildDebugOpts {
  material?: Material;
  rotation?: Rotation;
}

(
  window as unknown as {
    __fort?: {
      game: Game;
      input: InputSystem;
      player: Player;
      cameraRig: CameraRig;
      debug: typeof debug;
    };
  }
).__fort = { game, input, player, cameraRig, debug };
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
}
