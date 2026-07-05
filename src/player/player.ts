import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { PlayerState, PLAYER } from "./player-state.ts";
import { CollisionWorld, type Box } from "./collision.ts";
import { MovementController } from "./movement.ts";
import { buildHero, type Hero } from "../character/hero.ts";
import { AnimationController } from "../character/animation-controller.ts";

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
  private anim!: AnimationController;

  /** When true, the body faces the camera aim (build/edit mode facing). */
  aimMode = false;

  private readonly bodyTurnRate = 12; // radians per second

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

    this.hero = buildHero();
    this.state.yaw = Math.PI; // face away from the spawn camera initially
    game.scene.add(this.hero.group);
    this.anim = new AnimationController(this.hero);
  }

  setYawSource(fn: () => number): void {
    this.yawSource = fn;
  }

  getHero(): Hero {
    return this.hero;
  }

  /** Current player capsule as an AABB (used by build placement to reject
   * pieces that would intersect the player). */
  getCollisionBox(): Box {
    const s = this.state;
    const r = PLAYER.radius;
    return {
      minX: s.position.x - r,
      minY: s.position.y,
      minZ: s.position.z - r,
      maxX: s.position.x + r,
      maxY: s.position.y + s.height,
      maxZ: s.position.z + r,
    };
  }

  triggerBuildSwing(): void {
    this.anim.triggerBuildSwing();
  }

  get animState(): string {
    return this.anim.currentState;
  }

  fixedUpdate(dt: number): void {
    this.state.crouching = this.input.isDown("crouch");
    this.state.updateCrouchBlend(dt);
    this.movement.step(dt);
  }

  update(dt: number): void {
    const s = this.state;
    const speed = Math.hypot(s.velocity.x, s.velocity.z);

    // Facing: in aim mode the body faces the camera; otherwise it faces the
    // movement direction. The yaw turns toward the target at a capped rate so
    // there is no snap.
    let desired = s.yaw;
    if (this.aimMode) {
      desired = this.yawSource();
    } else if (speed > 0.4) {
      desired = Math.atan2(-s.velocity.x, -s.velocity.z);
    }
    s.yaw = turnToward(s.yaw, desired, this.bodyTurnRate * dt);

    this.hero.group.position.set(s.position.x, s.position.y, s.position.z);
    this.hero.group.rotation.y = s.yaw;
    const squash = s.height / PLAYER.standHeight;
    this.hero.group.scale.set(1, squash, 1);

    // Drive animation.
    this.anim.setState({ speed, onGround: s.onGround, crouching: s.crouching });
    this.anim.update(dt);

    // Aim mode adds an upper-body twist toward the camera when the legs face a
    // different direction (strafing / backpedaling while building).
    if (this.aimMode) {
      const spine = this.hero.bones.get("spine");
      if (spine) {
        const twist = clampAngle(angleDelta(s.yaw, this.aimMoveTwistTarget(speed)));
        spine.rotation.y = Math.max(-0.5, Math.min(0.5, twist));
      }
    }
  }

  private aimMoveTwistTarget(speed: number): number {
    if (speed <= 0.4) return this.state.yaw;
    return Math.atan2(-this.state.velocity.x, -this.state.velocity.z);
  }

  dispose(): void {
    this.anim.dispose();
    this.hero.dispose();
    this.hero.group.removeFromParent();
  }
}

// Turn `from` toward `to` by at most `maxStep`, taking the shortest way around.
function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clampAngle(a: number): number {
  return angleDelta(0, a);
}
