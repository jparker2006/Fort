import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { PlayerState, PLAYER } from "./player-state.ts";
import { CollisionWorld } from "./collision.ts";
import { MovementController } from "./movement.ts";
import { buildHero, type Hero } from "../character/hero.ts";

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
  private hero!: Hero;

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

    // The original hero replaces the earlier capsule placeholder. In bind pose
    // for T07; T08 drives its animation states.
    this.hero = buildHero();
    game.scene.add(this.hero.group);
  }

  setYawSource(fn: () => number): void {
    this.yawSource = fn;
  }

  getHero(): Hero {
    return this.hero;
  }

  fixedUpdate(dt: number): void {
    this.state.crouching = this.input.isDown("crouch");
    this.state.updateCrouchBlend(dt);
    this.movement.step(dt);
  }

  update(): void {
    // Place the hero at the feet position, facing the camera yaw, and squash
    // slightly toward crouch height (T08 replaces the squash with a crouch pose).
    const s = this.state;
    this.hero.group.position.set(s.position.x, s.position.y, s.position.z);
    this.hero.group.rotation.y = this.yawSource();
    const squash = s.height / PLAYER.standHeight;
    this.hero.group.scale.set(1, squash, 1);
  }

  dispose(): void {
    this.hero.dispose();
    this.hero.group.removeFromParent();
  }
}
