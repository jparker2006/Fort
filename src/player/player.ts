import * as THREE from "three";
import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { PlayerState, PLAYER } from "./player-state.ts";
import { CollisionWorld } from "./collision.ts";
import { MovementController } from "./movement.ts";

// Player system: owns the shared PlayerState, the collision world, and the
// movement controller. Renders a capsule placeholder until T07 supplies the
// real character. Movement direction is camera-relative, so a yaw source is
// injected after the camera rig is constructed.

export class Player implements System {
  readonly name = "player";
  readonly state = new PlayerState();
  readonly collision = new CollisionWorld();

  private movement!: MovementController;
  private yawSource: () => number = () => 0;
  private capsule!: THREE.Mesh;

  constructor(private readonly input: InputSystem) {}

  init(game: Game): void {
    this.movement = new MovementController(
      this.state,
      this.input,
      this.collision,
      () => this.yawSource(),
    );

    // Spawn standing on the island near center.
    this.state.position.set(0, 0, 6);

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

  setYawSource(fn: () => number): void {
    this.yawSource = fn;
  }

  fixedUpdate(dt: number): void {
    this.state.crouching = this.input.isDown("crouch");
    this.state.updateCrouchBlend(dt);
    this.movement.step(dt);
  }

  update(): void {
    const h = this.state.height;
    this.capsule.scale.set(1, h / PLAYER.standHeight, 1);
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
