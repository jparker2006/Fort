import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CollisionWorld } from "../player/collision.ts";
import { PoolRegistry, BuildModel, fullVariant } from "./build-model.ts";
import { baseGeometry } from "./variants.ts";
import { PIECE_TYPES } from "./piece.ts";
import { BuildController, TURBO_INTERVAL, TURBO_FIRST_DELAY } from "./build-controller.ts";
import { CELL_SIZE } from "../world/grid.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { CameraRig } from "../player/camera-rig.ts";
import type { Player } from "../player/player.ts";

// The turbo cadence lives in BuildController.updateBuild, but its wall-clock
// count is impossible to pin down through the browser: the camera spring lags a
// teleport, so spatial targeting jitters the placed slot. Here we drive the
// controller directly with tiny fakes and a straight-down aim ray at a cell we
// advance by frame index. That removes the spring and browser targeting, so the
// placement count is deterministic and the fast (0.05 s) cadence, the first-piece
// delay, and the single-tap rule can each be asserted exactly.

function makeModel(): BuildModel {
  const scene = new THREE.Scene();
  const registry = new PoolRegistry(scene);
  for (const type of PIECE_TYPES) registry.registerVariant(fullVariant(type), () => baseGeometry(type));
  return new BuildModel(registry, new CollisionWorld());
}

// Primary fire only: justPressed fires true exactly once per press (matching the
// real per-frame input edge); isDown stays true for the whole hold.
class FakeInput {
  primaryDown = false;
  private consumedEdge = false;
  press(): void {
    this.primaryDown = true;
    this.consumedEdge = false;
  }
  release(): void {
    this.primaryDown = false;
  }
  justPressed(action: string): boolean {
    if (action !== "primaryFire" || !this.primaryDown || this.consumedEdge) return false;
    this.consumedEdge = true;
    return true;
  }
  isDown(action: string): boolean {
    return action === "primaryFire" && this.primaryDown;
  }
}

interface Rig {
  input: FakeInput;
  controller: BuildController;
  model: BuildModel;
  /** Point the aim (and the player) straight down at a cell's centre. */
  at(cx: number, cz: number): void;
}

function makeRig(): Rig {
  const input = new FakeInput();
  const aim = { x: 0, z: 0 };
  const player = {
    state: { position: new THREE.Vector3(0, 0, 0) },
    aimMode: false,
    // A collision box parked far away, so it never vetoes a placement.
    getCollisionBox: () => ({ minX: 1e6, minY: 1e6, minZ: 1e6, maxX: 1e6 + 1, maxY: 1e6 + 1, maxZ: 1e6 + 1 }),
    triggerBuildSwing: () => {},
  } as unknown as Player;
  const camera = {
    lookContext: "look",
    getAimRay: (out: THREE.Ray = new THREE.Ray()) => {
      out.origin.set(aim.x, 5, aim.z);
      out.direction.set(0, -1, 0);
      return out;
    },
  } as unknown as CameraRig;

  const model = makeModel();
  const controller = new BuildController(input as unknown as InputSystem, camera, player, model);
  controller.init({ scene: new THREE.Scene() } as unknown as Parameters<BuildController["init"]>[0]);
  controller.setMode("build");
  controller.setPieceType("floor"); // floors are one slot per cell (no shared edges)

  return {
    input,
    controller,
    model,
    at(cx, cz) {
      aim.x = (cx + 0.5) * CELL_SIZE;
      aim.z = (cz + 0.5) * CELL_SIZE;
      (player.state.position as THREE.Vector3).set(aim.x, 0, aim.z);
    },
  };
}

const DT = 0.01; // 100 Hz driver: 0.05 s cadence = 5 steps, 0.15 s delay = 15 steps

describe("turbo cadence and first-piece delay (T25)", () => {
  it("a single tap places exactly one piece", () => {
    const rig = makeRig();
    rig.at(0, 0);
    rig.input.press();
    rig.controller.update(DT); // the tap frame
    rig.input.release();
    rig.controller.update(DT);
    expect(rig.model.count).toBe(1);
  });

  it("the first repeat waits TURBO_FIRST_DELAY, then the stream runs at TURBO_INTERVAL", () => {
    const rig = makeRig();
    // Hold fire and offer a fresh cell every frame, recording the sim time of the
    // first three placements.
    const times: number[] = [];
    rig.input.press();
    let placed = 0;
    for (let frame = 0; frame < 60 && times.length < 3; frame++) {
      rig.at(-20 + frame, 0); // a brand-new empty cell each frame
      rig.controller.update(DT);
      if (rig.model.count > placed) {
        placed = rig.model.count;
        times.push(frame * DT);
      }
    }
    expect(times).toHaveLength(3);
    // Tap is instant; the first repeat lands one FIRST_DELAY later; the next one
    // an INTERVAL after that. One driver step (DT) of slack absorbs the boundary.
    expect(times[0]!).toBeCloseTo(0, 6);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(TURBO_FIRST_DELAY - 1e-9);
    expect(times[1]! - times[0]!).toBeLessThan(TURBO_FIRST_DELAY + DT + 1e-9);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(TURBO_INTERVAL - 1e-9);
    expect(times[2]! - times[1]!).toBeLessThan(TURBO_INTERVAL + DT + 1e-9);
  });

  it("a 2 s hold across fresh cells fills at the fast cadence, not the old slow one", () => {
    const rig = makeRig();
    rig.input.press();
    // 200 frames = 2 s. Advance one fresh cell every 5 frames so the 40-cell
    // island lasts the whole hold and a fresh slot is always waiting at each
    // 0.05 s tick. At the fast cadence this lands ~38 (tap + one repeat per cell,
    // less the two the first-delay swallows). The OLD 0.1 s cadence would tick
    // half as often (~20), so the band cleanly separates the two rates.
    for (let frame = 0; frame < 200; frame++) {
      rig.at(-20 + Math.floor(frame / 5), 0);
      rig.controller.update(DT);
    }
    rig.input.release();
    expect(rig.model.count).toBeGreaterThanOrEqual(34);
    expect(rig.model.count).toBeLessThanOrEqual(40);
  });

  it("holding on a single fresh slot never double-places it (same-slot guard)", () => {
    const rig = makeRig();
    rig.at(0, 0);
    rig.input.press();
    for (let frame = 0; frame < 100; frame++) rig.controller.update(DT); // never move the aim
    rig.input.release();
    expect(rig.model.count).toBe(1); // the tap, and nothing more into the same cell
  });

  it("turbo is fully gated by the turboBuild toggle", () => {
    const rig = makeRig();
    rig.controller.gameplay = { ...rig.controller.gameplay, turboBuild: false };
    rig.input.press();
    for (let frame = 0; frame < 200; frame++) {
      rig.at(-20 + Math.floor(frame / 5), 0);
      rig.controller.update(DT);
    }
    rig.input.release();
    expect(rig.model.count).toBe(1); // only the initial tap; no auto-repeat stream
  });
});
