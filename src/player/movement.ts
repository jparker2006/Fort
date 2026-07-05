import type { Action } from "../input/actions.ts";
import { PLAYER, type PlayerState } from "./player-state.ts";
import { MOVE } from "./movement-tuning.ts";
import { CollisionWorld, boxesOverlap, type Box } from "./collision.ts";
import { clampToIsland } from "../world/grid.ts";

// The subset of the input API movement needs. InputSystem satisfies it; unit
// tests pass a fake so the arc can be simulated without a DOM.
export interface MovementInput {
  isDown(action: Action): boolean;
  justPressed(action: Action): boolean;
}

const EPS = 1e-3;

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return current;
}

export class MovementController {
  private coyote = 0;
  private buffer = 0;

  constructor(
    private readonly state: PlayerState,
    private readonly input: MovementInput,
    private readonly world: CollisionWorld,
    private readonly yawSource: () => number,
  ) {}

  step(dt: number): void {
    const s = this.state;

    // --- Intent ---
    const f = (this.input.isDown("moveForward") ? 1 : 0) - (this.input.isDown("moveBack") ? 1 : 0);
    const strafe = (this.input.isDown("moveRight") ? 1 : 0) - (this.input.isDown("moveLeft") ? 1 : 0);
    const crouching = s.crouching;
    const forwardDominant = f > 0 && f >= Math.abs(strafe);
    const sprinting = this.input.isDown("sprint") && forwardDominant && !crouching;

    // World-space move direction from camera yaw. Forward = (-sin, -cos).
    const yaw = this.yawSource();
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    let dirX = fwdX * f + rightX * strafe;
    let dirZ = fwdZ * f + rightZ * strafe;
    const dirLen = Math.hypot(dirX, dirZ);
    const hasInput = dirLen > EPS;
    if (hasInput) {
      dirX /= dirLen;
      dirZ /= dirLen;
    }

    const targetSpeed = crouching ? MOVE.crouchSpeed : sprinting ? MOVE.sprintSpeed : MOVE.runSpeed;
    const targetVX = hasInput ? dirX * targetSpeed : 0;
    const targetVZ = hasInput ? dirZ * targetSpeed : 0;

    // --- Horizontal acceleration ---
    if (s.onGround) {
      const rate = (hasInput ? MOVE.groundAccel : MOVE.groundDecel) * dt;
      s.velocity.x = approach(s.velocity.x, targetVX, rate);
      s.velocity.z = approach(s.velocity.z, targetVZ, rate);
    } else {
      // Air control: steer toward target with strong authority (can reverse),
      // but do not let input push horizontal speed past the air cap.
      const rate = MOVE.airAccel * dt;
      let vx = approach(s.velocity.x, targetVX, rate);
      let vz = approach(s.velocity.z, targetVZ, rate);
      const speed = Math.hypot(vx, vz);
      if (speed > MOVE.airMaxSpeed && speed > 0) {
        const k = MOVE.airMaxSpeed / speed;
        vx *= k;
        vz *= k;
      }
      s.velocity.x = vx;
      s.velocity.z = vz;
    }

    // --- Jump (with tiny coyote + buffer) ---
    this.coyote = s.onGround ? MOVE.coyoteTime : Math.max(0, this.coyote - dt);
    this.buffer = Math.max(0, this.buffer - dt);
    if (this.input.justPressed("jump")) this.buffer = MOVE.jumpBuffer;
    if (this.buffer > 0 && this.coyote > 0) {
      s.velocity.y = MOVE.jumpSpeed;
      s.onGround = false;
      this.coyote = 0;
      this.buffer = 0;
    }

    // --- Gravity (snappier on descent) ---
    const g = s.velocity.y > 0 ? MOVE.riseGravity : MOVE.fallGravity;
    s.velocity.y = Math.max(-MOVE.maxFallSpeed, s.velocity.y - g * dt);

    // --- Integrate with per-axis collision resolution ---
    this.moveY(s.velocity.y * dt);
    this.moveHorizontal("x", s.velocity.x * dt);
    this.moveHorizontal("z", s.velocity.z * dt);

    // Island bounds.
    s.position.x = clampToIsland(s.position.x);
    s.position.z = clampToIsland(s.position.z);
  }

  private playerBox(): Box {
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

  private moveY(dy: number): void {
    const s = this.state;
    const prevFeet = s.position.y;
    s.position.y += dy;

    let landed = false;
    let grounded = false;

    // Ground plane at y = 0.
    if (s.position.y <= 0) {
      s.position.y = 0;
      if (s.velocity.y <= 0) {
        s.velocity.y = 0;
        grounded = true;
      }
    }

    const pb = this.playerBox();
    for (const box of this.world.all()) {
      // Horizontal overlap required to interact vertically.
      if (pb.maxX <= box.minX || pb.minX >= box.maxX) continue;
      if (pb.maxZ <= box.minZ || pb.minZ >= box.maxZ) continue;

      if (dy <= 0) {
        // Falling: land on a box top the feet crossed.
        if (prevFeet >= box.maxY - EPS && s.position.y < box.maxY) {
          s.position.y = box.maxY;
          s.velocity.y = 0;
          grounded = true;
          landed = true;
        }
      } else {
        // Rising: bonk head on a box bottom.
        const head = s.position.y + s.height;
        const prevHead = prevFeet + s.height;
        if (prevHead <= box.minY + EPS && head > box.minY) {
          s.position.y = box.minY - s.height;
          s.velocity.y = 0;
        }
      }
    }

    void landed;
    const wasAir = !s.onGround;
    s.onGround = grounded;
    if (wasAir && grounded) s.onGround = true;
  }

  private moveHorizontal(axis: "x" | "z", delta: number): void {
    if (delta === 0) return;
    const s = this.state;
    s.position[axis] += delta;

    for (const box of this.world.all()) {
      const pb = this.playerBox();
      if (!boxesOverlap(pb, box)) continue;

      // Step-up: if the obstacle top is within stepHeight of the feet and there
      // is room to stand on it, climb instead of blocking (stairs, low ledges).
      const rise = box.maxY - s.position.y;
      if (rise > EPS && rise <= MOVE.stepHeight && this.canStandAt(s.position.x, s.position.z, box.maxY, box)) {
        s.position.y = box.maxY;
        s.onGround = true;
        continue;
      }

      // Otherwise block along this axis and kill the axis velocity.
      const r = PLAYER.radius;
      if (delta > 0) {
        s.position[axis] = (axis === "x" ? box.minX : box.minZ) - r - EPS;
      } else {
        s.position[axis] = (axis === "x" ? box.maxX : box.maxZ) + r + EPS;
      }
      s.velocity[axis] = 0;
    }
  }

  // Can the player stand with feet at footY at (x,z) without another box
  // intersecting the body? Ignores the box being stepped onto.
  private canStandAt(x: number, z: number, footY: number, ignore: Box): boolean {
    const r = PLAYER.radius;
    const test: Box = {
      minX: x - r,
      minY: footY + EPS,
      minZ: z - r,
      maxX: x + r,
      maxY: footY + this.state.height,
      maxZ: z + r,
    };
    for (const box of this.world.all()) {
      if (box === ignore) continue;
      if (boxesOverlap(test, box)) return false;
    }
    return true;
  }
}
