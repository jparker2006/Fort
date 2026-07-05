// Top-right 2D-canvas minimap. North-up, fixed orientation: a top-down view of
// the island with the build grid, placed pieces (walls as edge strokes, floors/
// stairs/roofs as material-coloured fills), and a player position + facing
// wedge. Redraws are throttled to ~10 Hz off the accumulated frame delta (so it
// is deterministic under the test frame pump), keeping cost negligible.

import type { Game, System } from "../core/game.ts";
import { ISLAND_SIZE, ISLAND_HALF, CELL_SIZE, ISLAND_CELLS } from "../world/grid.ts";
import type { Material, Slot } from "../build/piece.ts";

const REDRAW_INTERVAL = 0.1; // 10 Hz
const SIZE = 200; // backing-store pixels (CSS scales it responsively)

const MAP_COLOR: Record<Material, string> = {
  wood: "#b07a44",
  stone: "#9aa0a8",
  metal: "#7f8ea0",
};

export interface MinimapSources {
  forEachPiece(cb: (slot: Slot, material: Material) => void): void;
  playerPos(): { x: number; z: number };
  playerYaw(): number;
}

export class Minimap implements System {
  readonly name = "minimap";

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private accum = REDRAW_INTERVAL; // draw on the first frame
  private lastRenderMs = 0;
  private drawnPieces = 0;

  constructor(
    private readonly parent: HTMLElement,
    private readonly sources: MinimapSources,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "minimap";
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for minimap");
    this.ctx = ctx;
    this.parent.appendChild(this.canvas);
  }

  init(_game: Game): void {
    void _game;
    this.redraw();
  }

  update(dt: number): void {
    this.accum += dt;
    if (this.accum >= REDRAW_INTERVAL) {
      this.accum = 0;
      this.redraw();
    }
  }

  /** World X/Z to minimap pixel (north = up, +Z = down / south). */
  private toMap(x: number, z: number): { mx: number; my: number } {
    return {
      mx: ((x + ISLAND_HALF) / ISLAND_SIZE) * SIZE,
      my: ((z + ISLAND_HALF) / ISLAND_SIZE) * SIZE,
    };
  }

  redraw(): void {
    const start = performance.now();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Island backdrop and border.
    ctx.fillStyle = "#16321c";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Faint grid lines every few cells.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= ISLAND_CELLS; g += 4) {
      const p = (g / ISLAND_CELLS) * SIZE;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(SIZE, p);
    }
    ctx.stroke();

    // Placed pieces.
    const cellPx = (SIZE / ISLAND_SIZE) * CELL_SIZE;
    let count = 0;
    this.sources.forEachPiece((slot, material) => {
      count += 1;
      ctx.fillStyle = MAP_COLOR[material];
      ctx.strokeStyle = MAP_COLOR[material];
      if (slot.kind === "wall") {
        // A thin stroke along the wall edge line.
        ctx.lineWidth = 2;
        if (slot.axis === "z") {
          const a = this.toMap(slot.span * CELL_SIZE, slot.line * CELL_SIZE);
          const b = this.toMap(slot.span * CELL_SIZE + CELL_SIZE, slot.line * CELL_SIZE);
          ctx.beginPath();
          ctx.moveTo(a.mx, a.my);
          ctx.lineTo(b.mx, b.my);
          ctx.stroke();
        } else {
          const a = this.toMap(slot.line * CELL_SIZE, slot.span * CELL_SIZE);
          const b = this.toMap(slot.line * CELL_SIZE, slot.span * CELL_SIZE + CELL_SIZE);
          ctx.beginPath();
          ctx.moveTo(a.mx, a.my);
          ctx.lineTo(b.mx, b.my);
          ctx.stroke();
        }
      } else {
        // Floor / stairs / roof: a filled cell.
        const o = this.toMap(slot.cx * CELL_SIZE, slot.cz * CELL_SIZE);
        ctx.fillRect(o.mx, o.my, cellPx, cellPx);
      }
    });
    this.drawnPieces = count;

    // Player marker: a facing wedge. Forward = (-sin yaw, -cos yaw) in world XZ.
    const pp = this.sources.playerPos();
    const yaw = this.sources.playerYaw();
    const { mx, my } = this.toMap(pp.x, pp.z);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Perpendicular (right) vector for the wedge base.
    const rx = -fz;
    const rz = fx;
    const tip = 8;
    const half = 4.5;
    ctx.fillStyle = "#33c4c4";
    ctx.beginPath();
    ctx.moveTo(mx + fx * tip, my + fz * tip);
    ctx.lineTo(mx - fx * 3 + rx * half, my - fz * 3 + rz * half);
    ctx.lineTo(mx - fx * 3 - rx * half, my - fz * 3 - rz * half);
    ctx.closePath();
    ctx.fill();

    // Subtle inner border.
    ctx.strokeStyle = "rgba(51,196,196,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);

    this.lastRenderMs = performance.now() - start;
  }

  /** Milliseconds the last redraw took (test/perf helper). */
  lastRender(): number {
    return this.lastRenderMs;
  }

  /** Pieces drawn in the last redraw (test helper). */
  pieceCount(): number {
    return this.drawnPieces;
  }

  /** The player marker's map position and facing angle (test helper). */
  playerMarker(): { x: number; y: number; yaw: number } {
    const pp = this.sources.playerPos();
    const { mx, my } = this.toMap(pp.x, pp.z);
    return { x: mx, y: my, yaw: this.sources.playerYaw() };
  }

  dispose(): void {
    this.canvas.remove();
  }
}
