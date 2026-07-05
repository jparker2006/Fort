import { ACTIONS, type Action } from "./actions.ts";
import { DEFAULT_BINDINGS } from "./defaults.ts";

// The binding table maps each action to a single physical code. Conflict
// detection and rebinding live here; the class is pure (no DOM) and testable.

export interface RebindResult {
  ok: boolean;
  /** The action that previously held the requested code, if any. */
  conflictWith?: Action;
}

export class Bindings {
  private map: Record<Action, string>;

  constructor(initial?: Partial<Record<Action, string>>) {
    this.map = { ...DEFAULT_BINDINGS };
    if (initial) {
      for (const a of ACTIONS) {
        const code = initial[a];
        if (typeof code === "string" && code.length > 0) this.map[a] = code;
      }
    }
  }

  get(action: Action): string {
    return this.map[action];
  }

  /** The action currently bound to a code, or undefined. */
  actionFor(code: string): Action | undefined {
    return ACTIONS.find((a) => this.map[a] === code);
  }

  /**
   * Rebind an action to a code.
   * - resolution "reject" (default): if the code is already bound to another
   *   action, do nothing and report the conflict.
   * - resolution "swap": exchange codes with the conflicting action.
   * - resolution "steal": take the code and leave the other action unbound
   *   (its code becomes the empty string).
   */
  rebind(action: Action, code: string, resolution: "reject" | "swap" | "steal" = "reject"): RebindResult {
    const holder = this.actionFor(code);
    if (holder && holder !== action) {
      if (resolution === "reject") return { ok: false, conflictWith: holder };
      if (resolution === "swap") {
        this.map[holder] = this.map[action];
        this.map[action] = code;
        return { ok: true, conflictWith: holder };
      }
      // steal
      this.map[holder] = "";
      this.map[action] = code;
      return { ok: true, conflictWith: holder };
    }
    this.map[action] = code;
    return { ok: true };
  }

  /** Actions that share a code with another action (should normally be empty). */
  conflicts(): Array<{ code: string; actions: Action[] }> {
    const byCode = new Map<string, Action[]>();
    for (const a of ACTIONS) {
      const code = this.map[a];
      if (!code) continue;
      const list = byCode.get(code) ?? [];
      list.push(a);
      byCode.set(code, list);
    }
    const out: Array<{ code: string; actions: Action[] }> = [];
    for (const [code, actions] of byCode) {
      if (actions.length > 1) out.push({ code, actions });
    }
    return out;
  }

  resetAction(action: Action): void {
    this.map[action] = DEFAULT_BINDINGS[action];
  }

  resetAll(): void {
    this.map = { ...DEFAULT_BINDINGS };
  }

  toJSON(): Record<Action, string> {
    return { ...this.map };
  }
}

// Human-readable label for a code, used by the HUD tray and settings rows.
export function formatBindLabel(code: string): string {
  if (!code) return "Unbound";
  if (code === "Mouse0") return "L Mouse";
  if (code === "Mouse1") return "M Mouse";
  if (code === "Mouse2") return "R Mouse";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  const named: Record<string, string> = {
    Space: "Space",
    Escape: "Esc",
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    Tab: "Tab",
    Enter: "Enter",
    Backquote: "`",
    Backslash: "\\",
  };
  return named[code] ?? code;
}
