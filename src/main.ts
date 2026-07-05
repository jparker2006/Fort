import "./style.css";
import * as THREE from "three";
import { Game, type System } from "./core/game.ts";

// T02 bootstrap: engine loop, resize, visibility pause, FPS overlay, proven
// with a spinning debug cube. T03 replaces the debug system with the world.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

const game = new Game({ parent: app });
game.scene.background = new THREE.Color(0x12313a);
game.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.4));
game.camera.position.set(0, 0, 4);

// Debug spinning cube. Rotation advances in fixedUpdate so the spin rate is
// identical at 60, 120, and 144 Hz displays; render() interpolates for smooth
// motion between sim steps.
class SpinningCube implements System {
  readonly name = "debug-cube";
  private readonly mesh: THREE.Mesh;
  private angle = 0;
  private prevAngle = 0;
  private readonly speed = 1.2; // radians per second

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x33c4c4, roughness: 0.5 }),
    );
  }

  init(g: Game): void {
    g.scene.add(this.mesh);
  }

  fixedUpdate(dt: number): void {
    this.prevAngle = this.angle;
    this.angle += this.speed * dt;
  }

  render(alpha: number): void {
    const a = this.prevAngle + (this.angle - this.prevAngle) * alpha;
    this.mesh.rotation.set(a * 0.8, a, 0);
  }
}

game.add(new SpinningCube());
game.start();

(window as unknown as { __fort?: { game: Game } }).__fort = { game };
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
