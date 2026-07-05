import type { Game, System } from "../core/game.ts";
import { ACTIONS, type Action } from "./actions.ts";
import { Bindings, type RebindResult } from "./bindings.ts";
import { loadInput, saveInput } from "./persistence.ts";
import {
  scalePointerDelta,
  type InputSettings,
  type PointerDelta,
  type SensitivityContext,
} from "./sensitivity.ts";

// InputSystem is the only bridge between raw DOM input and gameplay. Gameplay
// asks it about actions (isDown / justPressed / justReleased) and pointer
// deltas; it never sees key codes. Per-frame press and release edges are
// captured in the DOM handlers and cleared in lateUpdate, after all consumers
// have run, so system ordering does not matter.

function mouseButtonCode(button: number): string | null {
  if (button === 0) return "Mouse0";
  if (button === 1) return "Mouse1";
  if (button === 2) return "Mouse2";
  return null;
}

export class InputSystem implements System {
  readonly name = "input";

  readonly bindings: Bindings;
  settings: InputSettings;

  private game!: Game;
  private enabled = false;

  private readonly down = new Set<Action>();
  private readonly pressedEdge = new Set<Action>();
  private readonly releasedEdge = new Set<Action>();

  private rawDx = 0;
  private rawDy = 0;

  constructor() {
    const loaded = loadInput();
    this.bindings = new Bindings(loaded.binds);
    this.settings = loaded.settings;
  }

  init(game: Game): void {
    this.game = game;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("blur", this.onBlur);
  }

  /** Enable/disable input capture. Disabled means no action state and no deltas. */
  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.clearAll();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // Gameplay-facing API. Actions only, never codes.

  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  justPressed(action: Action): boolean {
    return this.pressedEdge.has(action);
  }

  justReleased(action: Action): boolean {
    return this.releasedEdge.has(action);
  }

  /** Scaled look delta for a context; clears the raw accumulator. */
  consumePointerDelta(ctx: SensitivityContext): PointerDelta {
    const d = scalePointerDelta(this.rawDx, this.rawDy, ctx, this.settings);
    this.rawDx = 0;
    this.rawDy = 0;
    return d;
  }

  // Rebinding and settings, used by the settings menu (T17).

  rebind(action: Action, code: string, resolution: "reject" | "swap" | "steal" = "reject"): RebindResult {
    const res = this.bindings.rebind(action, code, resolution);
    if (res.ok) this.persist();
    return res;
  }

  resetBinding(action: Action): void {
    this.bindings.resetAction(action);
    this.persist();
  }

  resetAllBindings(): void {
    this.bindings.resetAll();
    this.persist();
  }

  updateSettings(patch: Partial<InputSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persist();
  }

  private persist(): void {
    saveInput(this.bindings.toJSON(), this.settings);
    this.game?.bus.emit("input:changed", { reason: "binding" });
  }

  lateUpdate(): void {
    this.pressedEdge.clear();
    this.releasedEdge.clear();
  }

  private press(code: string): void {
    for (const a of ACTIONS) {
      if (this.bindings.get(a) === code && !this.down.has(a)) {
        this.down.add(a);
        this.pressedEdge.add(a);
      }
    }
  }

  private release(code: string): void {
    for (const a of ACTIONS) {
      if (this.bindings.get(a) === code && this.down.has(a)) {
        this.down.delete(a);
        this.releasedEdge.add(a);
      }
    }
  }

  private clearAll(): void {
    for (const a of this.down) this.releasedEdge.add(a);
    this.down.clear();
    this.rawDx = 0;
    this.rawDy = 0;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (e.repeat) return;
    if (this.bindings.actionFor(e.code)) {
      // Stop the browser from scrolling on Space, etc., for bound keys.
      e.preventDefault();
      this.press(e.code);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this.bindings.actionFor(e.code)) this.release(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    const code = mouseButtonCode(e.button);
    if (code && this.bindings.actionFor(code)) this.press(code);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    const code = mouseButtonCode(e.button);
    if (code && this.bindings.actionFor(code)) this.release(code);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled) return;
    this.rawDx += e.movementX;
    this.rawDy += e.movementY;
  };

  private readonly onBlur = (): void => {
    // Losing focus releases everything so no key sticks down.
    this.clearAll();
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("blur", this.onBlur);
  }
}
