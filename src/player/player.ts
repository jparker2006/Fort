import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { PlayerState, PLAYER } from "./player-state.ts";

// Player system. In T05 it owns the shared PlayerState, drives the crouch blend
// from the crouch action, and renders a capsule placeholder that stands in for
// the character until T07. T06 adds the movement controller on top of this.

export class Player implements System {
  readonly name = "player";
  readonly state = new PlayerState();

  private capsule!: THREE.Mesh;

  constructor(private readonly input: InputSystem) {}

  init(game: Game): void {
    const geo = new THREE.CapsuleGeometry(
      PLAYER.radius,
      PLAYER.standHeight - PLAYER.radius * 2,
      6,
      12,
    );
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f8f8f, roughness: 0.6 });
    this.capsule = new THREE.Mesh(geo, mat);
    this.capsule.castShadow = true;
    this.capsule.name = "player-capsule";
    game.scene.add(this.capsule);
  }

  fixedUpdate(dt: number): void {
    this.state.crouching = this.input.isDown("crouch");
    this.state.updateCrouchBlend(dt);
  }

  update(): void {
    // Scale the placeholder to reflect crouch height and sit its base on the
    // ground at the feet position.
    const h = this.state.height;
    const yScale = h / PLAYER.standHeight;
    this.capsule.scale.set(1, yScale, 1);
    this.capsule.position.set(
      this.state.position.x,
      this.state.position.y + h / 2,
      this.state.position.z,
    );
  }

  setCapsuleVisible(v: boolean): void {
    this.capsule.visible = v;
  }

  dispose(): void {
    this.capsule.geometry.dispose();
    (this.capsule.material as THREE.Material).dispose();
    this.capsule.removeFromParent();
  }
}
