import { describe, it, expect } from "vitest";
import { PlayerState } from "./player-state.ts";
import { CollisionWorld, makeBox } from "./collision.ts";
import { MovementController, type MovementInput } from "./movement.ts";
import { MOVE, jumpApex, jumpAirtime } from "./movement-tuning.ts";
import { CELL_SIZE, CELL_HEIGHT } from "../world/grid.ts";
import type { Action } from "../input/actions.ts";

// Scriptable fake input: a set of held actions and one-shot pressed edges.
class FakeInput implements MovementInput {
  held = new Set<Action>();
  private pressed = new Set<Action>();
  isDown(a: Action): boolean {
    return this.held.has(a);
  }
  justPressed(a: Action): boolean {
    return this.pressed.has(a);
  }
  press(a: Action): void {
    this.pressed.add(a);
  }
  endFrame(): void {
    this.pressed.clear();
  }
}

function sim(input: FakeInput, world: CollisionWorld, yaw = 0) {
  const state = new PlayerState();
  const ctrl = new MovementController(state, input, world, () => yaw);
  return { state, ctrl };
}

const DT = 1 / 120;

describe("movement: jump arc", () => {
  it("apex matches the documented target within 5 percent", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);

    input.press("jump");
    let maxY = 0;
    for (let i = 0; i < 400; i++) {
      ctrl.step(DT);
      input.endFrame();
      maxY = Math.max(maxY, state.position.y);
      if (i > 2 && state.onGround) break;
    }
    const target = MOVE.jumpApexTarget;
    expect(Math.abs(maxY - target) / target).toBeLessThan(0.05);
    // And the analytic apex agrees with the target too.
    expect(Math.abs(jumpApex() - target) / target).toBeLessThan(0.05);
  });

  it("apex is about a quarter of a wall after the T28 retune", () => {
    // 0.9 apex against a 3.6 wall = 25 percent, Fortnite's ~half-a-player hop.
    expect(jumpApex()).toBeCloseTo(MOVE.jumpApexTarget, 1);
    expect(jumpApex() / CELL_HEIGHT).toBeCloseTo(0.25, 2);
  });

  it("airtime matches the analytic value within 5 percent", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);

    input.press("jump");
    let steps = 0;
    let airborne = false;
    for (let i = 0; i < 400; i++) {
      ctrl.step(DT);
      input.endFrame();
      if (!state.onGround) airborne = true;
      if (airborne) steps++;
      if (airborne && state.onGround) break;
    }
    const measured = steps * DT;
    expect(Math.abs(measured - jumpAirtime()) / jumpAirtime()).toBeLessThan(0.06);
  });
});

describe("movement: ground speeds", () => {
  function terminalSpeed(actions: Action[]): number {
    const input = new FakeInput();
    for (const a of actions) input.held.add(a);
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);
    for (let i = 0; i < 240; i++) ctrl.step(DT);
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  it("run, sprint, and crouch reach their tuned speeds", () => {
    expect(terminalSpeed(["moveForward"])).toBeCloseTo(MOVE.runSpeed, 1);
    expect(terminalSpeed(["moveForward", "sprint"])).toBeCloseTo(MOVE.sprintSpeed, 1);
  });

  it("crouch cancels sprint and uses crouch speed", () => {
    const input = new FakeInput();
    input.held.add("moveForward");
    input.held.add("sprint");
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);
    state.crouching = true; // player system would set this from the crouch key
    for (let i = 0; i < 240; i++) {
      state.crouching = true;
      ctrl.step(DT);
    }
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeCloseTo(MOVE.crouchSpeed, 1);
  });

  it("sprint requires a forward-dominant direction", () => {
    // Strafing only: sprint should not engage, so speed stays at run speed.
    const input = new FakeInput();
    input.held.add("moveRight");
    input.held.add("sprint");
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);
    for (let i = 0; i < 240; i++) ctrl.step(DT);
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeCloseTo(MOVE.runSpeed, 1);
  });

  it("reaches near full run speed quickly (snappy accel)", () => {
    const input = new FakeInput();
    input.held.add("moveForward");
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);
    // After ~0.15s the player should be near full speed.
    for (let i = 0; i < Math.round(0.15 / DT); i++) ctrl.step(DT);
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeGreaterThan(MOVE.runSpeed * 0.9);
  });
});

describe("movement: cell-crossing cadence (T27)", () => {
  // Fails loudly if either CELL_SIZE or a speed is retuned alone, keeping the
  // Fortnite-observed cross-times (jog ~1.02 s, sprint ~0.8 s per 4.8 cell) tied
  // to the shipped speeds. Tolerance 0.02 s absorbs the rounding in the speeds.
  it("a jog crosses one cell in about 1.02 s", () => {
    expect(CELL_SIZE / MOVE.runSpeed).toBeCloseTo(1.02, 2);
    expect(Math.abs(CELL_SIZE / MOVE.runSpeed - 1.02)).toBeLessThan(0.02);
  });

  it("a sprint crosses one cell in about 0.8 s", () => {
    expect(Math.abs(CELL_SIZE / MOVE.sprintSpeed - 0.8)).toBeLessThan(0.02);
  });

  it("keeps the sprint:run ratio near 1.28 and the crouch:run ratio near 0.51", () => {
    expect(MOVE.sprintSpeed / MOVE.runSpeed).toBeCloseTo(1.28, 1);
    expect(MOVE.crouchSpeed / MOVE.runSpeed).toBeCloseTo(0.51, 1);
  });
});

describe("movement: air control", () => {
  it("can reverse horizontal direction mid-jump", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world, 0); // yaw 0: forward is -Z

    // Build forward momentum on the ground, then jump.
    input.held.add("moveForward");
    for (let i = 0; i < 60; i++) ctrl.step(DT);
    expect(state.velocity.z).toBeLessThan(0); // moving -Z
    input.press("jump");
    ctrl.step(DT);
    input.endFrame();

    // Now hold back mid-air; velocity.z should cross zero to positive.
    input.held.delete("moveForward");
    input.held.add("moveBack");
    let reversed = false;
    for (let i = 0; i < 120 && !state.onGround; i++) {
      ctrl.step(DT);
      if (state.velocity.z > 0.5) reversed = true;
    }
    expect(reversed).toBe(true);
  });

  it("does not exceed the air speed cap from input", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    const { state, ctrl } = sim(input, world);
    input.held.add("moveForward");
    input.press("jump");
    for (let i = 0; i < 120 && (i < 2 || !state.onGround); i++) {
      ctrl.step(DT);
      input.endFrame();
      expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeLessThanOrEqual(
        MOVE.airMaxSpeed + 0.01,
      );
    }
  });
});

describe("movement: collision", () => {
  it("blocks against a tall wall and does not climb it", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    // Full-height wall (3 tall) 2 units ahead (-Z) of spawn.
    world.add(makeBox(0, 1.5, -2, 4, 3, 0.4));
    const { state, ctrl } = sim(input, world);
    input.held.add("moveForward");
    for (let i = 0; i < 240; i++) ctrl.step(DT);
    // Stopped in front of the wall, still on the ground (did not climb).
    expect(state.position.z).toBeGreaterThan(-2 + 0.2 - 0.4);
    expect(state.position.y).toBeLessThan(0.1);
  });

  it("auto-steps a low ledge within step height", () => {
    const input = new FakeInput();
    const world = new CollisionWorld();
    // A deep 0.5-high platform ahead; within stepHeight so the player climbs it
    // and stays on top rather than blocking.
    world.add(makeBox(0, 0.25, -20, 8, 0.5, 40));
    const { state, ctrl } = sim(input, world);
    input.held.add("moveForward");
    let steppedSmoothly = true;
    let prevY = state.position.y;
    for (let i = 0; i < 200; i++) {
      ctrl.step(DT);
      // No single step should teleport the height by more than stepHeight.
      if (Math.abs(state.position.y - prevY) > 0.6) steppedSmoothly = false;
      prevY = state.position.y;
    }
    // Climbed onto the platform (y near 0.5) and is walking along it.
    expect(state.position.y).toBeGreaterThan(0.45);
    expect(state.position.z).toBeLessThan(-1.5);
    expect(steppedSmoothly).toBe(true);
  });
});
