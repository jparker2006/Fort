// The HUD system: a DOM/CSS overlay built once and refreshed each frame from
// the game state. It reads only through a small source interface (so it stays
// decoupled and testable) and pulls piece bind labels live from the binding
// system, refreshing them on the "input:changed" event.

import type { Game, System } from "../core/game.ts";
import type { Action } from "../input/actions.ts";
import type { PieceType, Material } from "../build/piece.ts";
import {
  ICON_WALL,
  ICON_FLOOR,
  ICON_STAIRS,
  ICON_ROOF,
  ICON_WOOD,
  ICON_STONE,
  ICON_METAL,
  CROSSHAIR_BUILD,
  CROSSHAIR_EDIT,
  CROSSHAIR_MATTOCK,
} from "./icons.ts";

export type HudMode = "movement" | "build" | "mattock" | "edit";

/** Everything the HUD needs to read, provided by the controllers via main. */
export interface HudSources {
  mode(): HudMode;
  piece(): PieceType;
  material(): Material;
  bindLabel(action: Action): string;
}

const PIECES: ReadonlyArray<{ type: PieceType; action: Action; icon: string }> = [
  { type: "wall", action: "buildWall", icon: ICON_WALL },
  { type: "floor", action: "buildFloor", icon: ICON_FLOOR },
  { type: "stairs", action: "buildStairs", icon: ICON_STAIRS },
  { type: "roof", action: "buildRoof", icon: ICON_ROOF },
];

const MODE_LABEL: Record<HudMode, string> = {
  movement: "Mattock",
  build: "Build",
  mattock: "Mattock",
  edit: "Edit",
};

export class Hud implements System {
  readonly name = "hud";

  private readonly root: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly materialEl: HTMLElement;
  private readonly slots = new Map<PieceType, { el: HTMLElement; key: HTMLElement }>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly sources: HudSources,
  ) {
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = this.markup();
    this.parent.appendChild(this.root);

    this.crosshair = this.q("#hud-crosshair");
    this.modeEl = this.q("#hud-mode");
    this.materialEl = this.q("#hud-material");
    for (const p of PIECES) {
      const el = this.q(`.tray-slot[data-piece="${p.type}"]`);
      this.slots.set(p.type, { el, key: el.querySelector(".tray-key") as HTMLElement });
    }
  }

  init(game: Game): void {
    // Refresh bind labels immediately and whenever a binding changes.
    this.refreshBindLabels();
    this.unsubscribe = game.bus.on("input:changed", () => this.refreshBindLabels());
  }

  update(): void {
    const mode = this.sources.mode();
    this.crosshair.dataset.mode = mode;
    this.modeEl.dataset.mode = mode;
    this.modeEl.textContent = MODE_LABEL[mode];

    const activePiece = mode === "build" ? this.sources.piece() : null;
    for (const [type, slot] of this.slots) {
      slot.el.classList.toggle("active", type === activePiece);
    }

    this.materialEl.dataset.material = this.sources.material();
  }

  /** Read the current tray key label for a piece (test helper). */
  trayLabel(type: PieceType): string {
    return this.slots.get(type)?.key.textContent ?? "";
  }

  private refreshBindLabels(): void {
    for (const p of PIECES) {
      const slot = this.slots.get(p.type);
      if (slot) slot.key.textContent = this.sources.bindLabel(p.action);
    }
  }

  private markup(): string {
    const traySlots = PIECES.map(
      (p) =>
        `<div class="tray-slot" data-piece="${p.type}"><span class="tray-key"></span>${p.icon}</div>`,
    ).join("");
    return `
      <div id="hud-crosshair" data-mode="build">
        <span class="cx-build">${CROSSHAIR_BUILD}</span>
        <span class="cx-edit">${CROSSHAIR_EDIT}</span>
        <span class="cx-mattock">${CROSSHAIR_MATTOCK}</span>
      </div>
      <div id="hud-corner">
        <div id="hud-mode" data-mode="build">Build</div>
        <div id="hud-row">
          <div id="hud-tray">${traySlots}</div>
          <div id="hud-material" data-material="wood">
            <div class="mat-icon">
              <span class="mat-wood">${ICON_WOOD}</span>
              <span class="mat-stone">${ICON_STONE}</span>
              <span class="mat-metal">${ICON_METAL}</span>
            </div>
            <span class="mat-count">&#8734;</span>
          </div>
        </div>
      </div>`;
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`HUD element missing: ${sel}`);
    return el as HTMLElement;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.root.remove();
  }
}
