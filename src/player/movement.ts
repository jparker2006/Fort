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

  // Reused scratch: the near-query result for this step and the query AABB. No
  // per-step allocation in the collision hot path.
  private readonly nearBoxes: Box[] = [];
  private readonly queryBox: Box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  private readonly pbScratch: Box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  private readonly standScratch: Box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

  constructor(
    private readonly state: PlayerState,
    private readonly input: MovementInput,
    private readonly world: CollisionWorld,
    private readonly yawSource: () => number,
  ) {}

  step(dt: number): void {
    const s = this.state;

    // Gather the boxes near the player once for this whole step (expanded to
    // cover the swept motion plus step-up reach). moveY/moveHorizontal/canStand
    // all iterate this small set instead of every box in the world.
    this.refreshNear(dt);

    // --- Intent ---
    const f = (this.input.isDown("moveForward") ? 1 : 0) - (this.input.isDown("moveBack") ? 1 : 0);
    const strafe = (this.input.isDown("moveRight") ? 1 : 0) - (this.input.isDown("moveLeft") ? 1 : 0);
    const crouching = s.crouching;
    const forwardDominant = f > 0 && f >= Math.abs(strafe);
    const wantSprint = this.input.isDown("sprint") && forwardDominant && !crouching;

    // Stamina gate (T29): once drained to zero, latch sprint off until stamina
    // recovers above the re-engage fraction (hysteresis, so it will not flicker
    // at empty).
    if (s.stamina <= 0) s.sprintBlocked = true;
    else if (s.stamina >= MOVE.staminaMax * MOVE.staminaReengage) s.sprintBlocked = false;
    const sprinting = wantSprint && !s.sprintBlocked;
    // Sprint-active (the drain/boost condition) additionally requires the feet on
    // the ground; airborne neither drains nor regenerates.
    const sprintActive = sprinting && s.onGround;
    if (s.onGround) {
      s.stamina = sprintActive
        ? Math.max(0, s.stamina - MOVE.staminaDrain * dt)
        : Math.min(MOVE.staminaMax, s.stamina + MOVE.staminaRegen * dt);
    }

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
      // Sprint-jump: a jump that STARTS while sprint-active leaves the ground
      // faster (apex scales by the square of the boost). A mid-air sprint press
      // cannot boost an in-flight jump because sprintActive requires grounding.
      s.velocity.y = sprintActive ? MOVE.jumpSpeed * MOVE.sprintJumpBoost : MOVE.jumpSpeed;
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

  private refreshNear(dt: number): void {
    const s = this.state;
    const r = PLAYER.radius;
    const m = MOVE.stepHeight + 1; // margin: step-up reach + piece half-thickness
    const dx = Math.abs(s.velocity.x * dt) + r + m;
    const dy = Math.abs(s.velocity.y * dt) + m;
    const dz = Math.abs(s.velocity.z * dt) + r + m;
    const q = this.queryBox;
    q.minX = s.position.x - dx;
    q.maxX = s.position.x + dx;
    q.minY = s.position.y - dy;
    q.maxY = s.position.y + s.height + dy;
    q.minZ = s.position.z - dz;
    q.maxZ = s.position.z + dz;
    this.world.near(q, this.nearBoxes);
  }

  private playerBox(): Box {
    const s = this.state;
    const r = PLAYER.radius;
    const b = this.pbScratch;
    b.minX = s.position.x - r;
    b.minY = s.position.y;
    b.minZ = s.position.z - r;
    b.maxX = s.position.x + r;
    b.maxY = s.position.y + s.height;
    b.maxZ = s.position.z + r;
    return b;
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
    for (const box of this.nearBoxes) {
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

    for (const box of this.nearBoxes) {
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
    const test = this.standScratch;
    test.minX = x - r;
    test.minY = footY + EPS;
    test.minZ = z - r;
    test.maxX = x + r;
    test.maxY = footY + this.state.height;
    test.maxZ = z + r;
    for (const box of this.nearBoxes) {
      if (box === ignore) continue;
      if (boxesOverlap(test, box)) return false;
    }
    return true;
  }
}
