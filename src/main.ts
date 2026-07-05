import "./style.css";
import * as THREE from "three";
import { Game, type System } from "./core/game.ts";
import { World } from "./world/island.ts";
import { InputSystem } from "./input/input-system.ts";
import { DebugInputOverlay } from "./input/debug-input-overlay.ts";
import { Player } from "./player/player.ts";
import { CameraRig } from "./player/camera-rig.ts";

// T05 bootstrap: island, input, player capsule placeholder, and the
// third-person camera rig. Movement (T06) and the real character (T07) build
// on the Player and CameraRig systems added here.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

const game = new Game({ parent: app });

const input = new InputSystem();
input.setEnabled(true); // T18 gates this behind pointer lock; on for early review
game.add(input);
game.add(new World());

const player = new Player(input);
game.add(player);

const cameraRig = new CameraRig(input, player);
game.add(cameraRig);

// The spring arm collides against the ground so the camera never dips below it.
const ground = game.scene.getObjectByName("ground");
if (ground) cameraRig.addCollider(ground);

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
};

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
