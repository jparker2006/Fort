// The complete set of gameplay actions. Gameplay code refers to these names
// only and never to physical key codes; the binding layer maps codes to
// actions. Adding an action here means it becomes rebindable everywhere.

export const ACTIONS = [
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "jump",
  "sprint",
  "crouch",
  "buildWall",
  "buildFloor",
  "buildStairs",
  "buildRoof",
  "edit",
  "resetEdit",
  "rotate",
  "materialCycle",
  "destroyPickaxe",
  "buildCombatToggle",
  "primaryFire",
  "settingsMenu",
] as const;

export type Action = (typeof ACTIONS)[number];

export type ActionCategory = "Movement" | "Building" | "Editing" | "System";

export interface ActionMeta {
  label: string;
  category: ActionCategory;
  /** Hold actions are active while held; press actions fire on the down edge. */
  kind: "hold" | "press";
}

export const ACTION_META: Record<Action, ActionMeta> = {
  moveForward: { label: "Move Forward", category: "Movement", kind: "hold" },
  moveBack: { label: "Move Back", category: "Movement", kind: "hold" },
  moveLeft: { label: "Move Left", category: "Movement", kind: "hold" },
  moveRight: { label: "Move Right", category: "Movement", kind: "hold" },
  jump: { label: "Jump", category: "Movement", kind: "press" },
  sprint: { label: "Sprint", category: "Movement", kind: "hold" },
  crouch: { label: "Crouch", category: "Movement", kind: "hold" },
  buildWall: { label: "Build Wall", category: "Building", kind: "press" },
  buildFloor: { label: "Build Floor", category: "Building", kind: "press" },
  buildStairs: { label: "Build Stairs", category: "Building", kind: "press" },
  buildRoof: { label: "Build Roof", category: "Building", kind: "press" },
  edit: { label: "Edit", category: "Editing", kind: "hold" },
  resetEdit: { label: "Reset Edit", category: "Editing", kind: "press" },
  rotate: { label: "Rotate Piece", category: "Building", kind: "press" },
  materialCycle: { label: "Cycle Material", category: "Building", kind: "press" },
  destroyPickaxe: { label: "Mattock / Destroy", category: "Building", kind: "press" },
  buildCombatToggle: { label: "Build / Combat Toggle", category: "Building", kind: "press" },
  primaryFire: { label: "Primary Fire", category: "System", kind: "hold" },
  settingsMenu: { label: "Settings Menu", category: "System", kind: "press" },
};

export function actionsByCategory(): Record<ActionCategory, Action[]> {
  const out: Record<ActionCategory, Action[]> = {
    Movement: [],
    Building: [],
    Editing: [],
    System: [],
  };
  for (const a of ACTIONS) out[ACTION_META[a].category].push(a);
  return out;
}
