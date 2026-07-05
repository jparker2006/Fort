import type { Action } from "./actions.ts";
import type { InputSettings } from "./sensitivity.ts";

// Fortnite-familiar defaults. Nothing here is treated as final: every action is
// rebindable in the settings menu and the resolved binds live in localStorage.
//
// Codes are KeyboardEvent.code values, or the pseudo-codes "Mouse0" (left),
// "Mouse1" (middle), "Mouse2" (right) for mouse buttons.

export const DEFAULT_BINDINGS: Record<Action, string> = {
  moveForward: "KeyW",
  moveBack: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  crouch: "ControlLeft",
  buildWall: "KeyZ",
  buildFloor: "KeyX",
  buildStairs: "KeyC",
  buildRoof: "KeyV",
  edit: "KeyG",
  resetEdit: "KeyT",
  rotate: "KeyR",
  materialCycle: "KeyF",
  destroyPickaxe: "Digit1",
  buildCombatToggle: "KeyB",
  primaryFire: "Mouse0",
  settingsMenu: "Escape",
};

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  lookSensitivity: 1.0,
  targetingSensitivity: 0.7,
  buildSensitivityMultiplier: 1.0,
  editSensitivityMultiplier: 1.0,
  invertY: false,
};
