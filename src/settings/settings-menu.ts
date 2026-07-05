// The in-game settings menu (Esc). A mouse-driven, tabbed modal overlay:
// Input (click-to-rebind rows with conflict resolution and reset), Sensitivity
// (per-context sliders, FOV, invert Y), and Gameplay (turbo build, edit-on-
// release toggles). Every change applies instantly and persists to localStorage
// through the input persistence schema. Opening pauses the sim and freezes
// gameplay input; the rebind capture listens to raw DOM events directly so it
// works while gameplay input is disabled.

import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import { ACTIONS, ACTION_META, actionsByCategory, type Action } from "../input/actions.ts";
import { formatBindLabel } from "../input/bindings.ts";
import { FOV_MIN, FOV_MAX, type InputSettings } from "../input/sensitivity.ts";
import { saveGameplay } from "../input/persistence.ts";
import type { GameplaySettings } from "./gameplay.ts";

export interface SettingsDeps {
  input: InputSystem;
  /** Shared gameplay settings object, also referenced by the controllers. */
  gameplay: GameplaySettings;
  /** Resume the session (the session owns pause/input; the menu just requests it). */
  onResume: () => void;
}

interface SliderDef {
  key: keyof InputSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDef[] = [
  { key: "lookSensitivity", label: "Look Sensitivity", min: 0.1, max: 3, step: 0.05 },
  { key: "targetingSensitivity", label: "Targeting Sensitivity", min: 0.1, max: 3, step: 0.05 },
  { key: "buildSensitivityMultiplier", label: "Build Sensitivity", min: 0.2, max: 2, step: 0.05 },
  { key: "editSensitivityMultiplier", label: "Edit Sensitivity", min: 0.2, max: 2, step: 0.05 },
  { key: "fov", label: "Field of View", min: FOV_MIN, max: FOV_MAX, step: 1 },
];

const GAMEPLAY_TOGGLES: Array<{ key: keyof GameplaySettings; label: string }> = [
  { key: "turboBuild", label: "Turbo Build" },
  { key: "confirmEditOnRelease", label: "Confirm Edit On Release" },
  { key: "resetEditOnRelease", label: "Reset Edit On Release" },
];

export class SettingsMenu implements System {
  readonly name = "settings-menu";

  private readonly root: HTMLElement;
  private open = false;
  private arming: Action | null = null;
  private pendingCode: string | null = null; // code awaiting a conflict decision
  private readonly keyButtons = new Map<Action, HTMLButtonElement>();

  constructor(
    private readonly parent: HTMLElement,
    private readonly deps: SettingsDeps,
  ) {
    this.root = document.createElement("div");
    this.root.id = "settings";
    this.root.hidden = true;
    this.root.innerHTML = this.markup();
    this.parent.appendChild(this.root);
    this.wire();
    this.refreshBindLabels();
    this.syncControls();
  }

  init(_game: Game): void {
    void _game;
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Test hook: arm a bind row directly (the real capture + rebind path then
   * runs off a genuine keypress), avoiding flaky synthetic mouse hit-testing. */
  debugArm(action: Action): void {
    this.armRebind(action);
  }

  /** Show the menu (the session pauses and freezes input around this). */
  openMenu(): void {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.syncControls();
    document.addEventListener("keydown", this.onMenuKey, true);
  }

  /** Hide the menu (called by the session on resume). */
  closeMenu(): void {
    if (!this.open) return;
    this.cancelArming();
    this.open = false;
    this.root.hidden = true;
    document.removeEventListener("keydown", this.onMenuKey, true);
  }

  // --- Rebinding capture ---

  private armRebind(action: Action): void {
    this.cancelArming();
    this.arming = action;
    const btn = this.keyButtons.get(action);
    if (btn) {
      btn.textContent = "Press a key...";
      btn.classList.add("arming");
    }
    document.addEventListener("keydown", this.onCaptureKey, true);
    document.addEventListener("mousedown", this.onCaptureMouse, true);
  }

  private cancelArming(): void {
    if (!this.arming) return;
    document.removeEventListener("keydown", this.onCaptureKey, true);
    document.removeEventListener("mousedown", this.onCaptureMouse, true);
    const btn = this.keyButtons.get(this.arming);
    btn?.classList.remove("arming");
    this.arming = null;
    this.refreshBindLabels();
    this.hideConflict();
  }

  private tryBind(code: string): void {
    const action = this.arming;
    if (!action) return;
    const res = this.deps.input.rebind(action, code, "reject");
    if (res.ok) {
      this.finishArming();
      return;
    }
    // Conflict: offer swap or cancel, keeping the code pending.
    this.pendingCode = code;
    this.showConflict(action, res.conflictWith!, code);
  }

  private finishArming(): void {
    document.removeEventListener("keydown", this.onCaptureKey, true);
    document.removeEventListener("mousedown", this.onCaptureMouse, true);
    const btn = this.arming ? this.keyButtons.get(this.arming) : null;
    btn?.classList.remove("arming");
    this.arming = null;
    this.pendingCode = null;
    this.refreshBindLabels();
    this.hideConflict();
  }

  private readonly onCaptureKey = (e: KeyboardEvent): void => {
    if (!this.arming) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      this.cancelArming();
      return;
    }
    this.tryBind(e.code);
  };

  private readonly onCaptureMouse = (e: MouseEvent): void => {
    if (!this.arming) return;
    // Ignore clicks on the conflict prompt buttons so Swap/Cancel still work.
    if ((e.target as HTMLElement)?.closest("#bind-conflict")) return;
    e.preventDefault();
    e.stopPropagation();
    const code = e.button === 0 ? "Mouse0" : e.button === 1 ? "Mouse1" : e.button === 2 ? "Mouse2" : null;
    if (code) this.tryBind(code);
  };

  private readonly onMenuKey = (e: KeyboardEvent): void => {
    if (e.code !== "Escape") return;
    if (this.arming) return; // capture handler deals with it
    e.preventDefault();
    this.deps.onResume();
  };

  // --- Conflict prompt ---

  private showConflict(action: Action, holder: Action, code: string): void {
    const box = this.q("#bind-conflict");
    (this.q(".conflict-text") as HTMLElement).textContent =
      `${formatBindLabel(code)} is bound to ${ACTION_META[holder].label}. Swap it with ${ACTION_META[action].label}?`;
    box.hidden = false;
  }

  private hideConflict(): void {
    this.q("#bind-conflict").hidden = true;
  }

  // --- DOM ---

  private wire(): void {
    // Tabs.
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>(".settings-tabs button")) {
      tab.addEventListener("click", () => this.selectTab(tab.dataset.tab!));
    }
    // Bind rows.
    for (const a of ACTIONS) {
      const btn = this.root.querySelector<HTMLButtonElement>(`.bind-key[data-action="${a}"]`);
      if (btn) {
        this.keyButtons.set(a, btn);
        btn.addEventListener("click", () => this.armRebind(a));
      }
      const reset = this.root.querySelector<HTMLButtonElement>(`.bind-reset[data-action="${a}"]`);
      reset?.addEventListener("click", () => {
        this.deps.input.resetBinding(a);
        this.refreshBindLabels();
      });
    }
    this.q("#settings-reset-all").addEventListener("click", () => {
      this.deps.input.resetAllBindings();
      this.refreshBindLabels();
    });
    this.q("#settings-close").addEventListener("click", () => this.deps.onResume());
    this.q("#conflict-swap").addEventListener("click", () => {
      if (this.arming && this.pendingCode) this.deps.input.rebind(this.arming, this.pendingCode, "swap");
      this.finishArming();
    });
    this.q("#conflict-cancel").addEventListener("click", () => this.cancelArming());

    // Sliders.
    for (const s of SLIDERS) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-setting="${s.key}"]`);
      input?.addEventListener("input", () => {
        const value = Number(input.value);
        this.deps.input.updateSettings({ [s.key]: value } as Partial<InputSettings>);
        this.updateSliderValue(s.key, value);
      });
    }
    const invert = this.root.querySelector<HTMLInputElement>('input[data-setting="invertY"]');
    invert?.addEventListener("change", () => {
      this.deps.input.updateSettings({ invertY: invert.checked });
    });

    // Gameplay toggles.
    for (const g of GAMEPLAY_TOGGLES) {
      const box = this.root.querySelector<HTMLInputElement>(`input[data-gameplay="${g.key}"]`);
      box?.addEventListener("change", () => {
        this.deps.gameplay[g.key] = box.checked;
        saveGameplay(this.deps.gameplay);
      });
    }
  }

  private selectTab(name: string): void {
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>(".settings-tabs button")) {
      tab.classList.toggle("active", tab.dataset.tab === name);
    }
    for (const panel of this.root.querySelectorAll<HTMLElement>("[data-panel]")) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  private refreshBindLabels(): void {
    for (const [a, btn] of this.keyButtons) {
      btn.textContent = formatBindLabel(this.deps.input.bindings.get(a));
    }
  }

  /** Push current setting values into the controls (on open / after load). */
  private syncControls(): void {
    const s = this.deps.input.settings;
    for (const def of SLIDERS) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-setting="${def.key}"]`);
      if (input) {
        input.value = String(s[def.key]);
        this.updateSliderValue(def.key, s[def.key] as number);
      }
    }
    const invert = this.root.querySelector<HTMLInputElement>('input[data-setting="invertY"]');
    if (invert) invert.checked = s.invertY;
    for (const g of GAMEPLAY_TOGGLES) {
      const box = this.root.querySelector<HTMLInputElement>(`input[data-gameplay="${g.key}"]`);
      if (box) box.checked = this.deps.gameplay[g.key];
    }
    this.refreshBindLabels();
  }

  private updateSliderValue(key: keyof InputSettings, value: number): void {
    const out = this.root.querySelector<HTMLElement>(`.slider-value[data-setting="${key}"]`);
    if (out) out.textContent = key === "fov" ? String(Math.round(value)) : value.toFixed(2);
  }

  private markup(): string {
    const cats = actionsByCategory();
    const rows = (Object.keys(cats) as Array<keyof typeof cats>)
      .map((cat) => {
        const items = cats[cat]
          .map(
            (a) =>
              `<div class="bind-row"><span class="bind-label">${ACTION_META[a].label}</span>` +
              `<button class="bind-key" data-action="${a}"></button>` +
              `<button class="bind-reset" data-action="${a}">Reset</button></div>`,
          )
          .join("");
        return `<h3>${cat}</h3>${items}`;
      })
      .join("");

    const sliders = SLIDERS.map(
      (s) =>
        `<label class="slider-row"><span>${s.label}</span>` +
        `<input type="range" data-setting="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"/>` +
        `<span class="slider-value" data-setting="${s.key}"></span></label>`,
    ).join("");

    const toggles = GAMEPLAY_TOGGLES.map(
      (g) =>
        `<label class="toggle-row"><input type="checkbox" data-gameplay="${g.key}"/><span>${g.label}</span></label>`,
    ).join("");

    return `
      <div class="settings-panel">
        <h1>Settings</h1>
        <div class="settings-tabs">
          <button data-tab="input" class="active">Input</button>
          <button data-tab="sensitivity">Sensitivity</button>
          <button data-tab="gameplay">Gameplay</button>
        </div>
        <div class="settings-body">
          <div data-panel="input">${rows}</div>
          <div data-panel="sensitivity" hidden>${sliders}
            <label class="toggle-row"><input type="checkbox" data-setting="invertY"/><span>Invert Y</span></label>
          </div>
          <div data-panel="gameplay" hidden>${toggles}</div>
        </div>
        <div id="bind-conflict" hidden>
          <span class="conflict-text"></span>
          <button id="conflict-swap">Swap</button>
          <button id="conflict-cancel">Cancel</button>
        </div>
        <div class="settings-footer">
          <button id="settings-reset-all">Reset All Binds</button>
          <button id="settings-close">Resume</button>
        </div>
      </div>`;
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`Settings element missing: ${sel}`);
    return el as HTMLElement;
  }

  dispose(): void {
    document.removeEventListener("keydown", this.onMenuKey, true);
    document.removeEventListener("keydown", this.onCaptureKey, true);
    document.removeEventListener("mousedown", this.onCaptureMouse, true);
    this.root.remove();
  }
}
