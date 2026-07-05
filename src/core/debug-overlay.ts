// Debug FPS and frame-time readout, toggled with a key (default Backquote).
// This is a developer diagnostic, not gameplay, so it listens to the keyboard
// directly rather than through the action map.

export interface FrameStats {
  fps: number;
  frameMs: number;
  simSteps: number;
  drawCalls: number;
}

export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private visible = false;
  private smoothedMs = 16.6;
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement, toggleCode = "Backquote") {
    this.el = document.createElement("div");
    this.el.id = "debug-overlay";
    Object.assign(this.el.style, {
      position: "fixed",
      top: "8px",
      left: "8px",
      padding: "6px 9px",
      font: "12px ui-monospace, Menlo, Consolas, monospace",
      color: "#b8f0f0",
      background: "rgba(6, 18, 22, 0.72)",
      border: "1px solid rgba(51, 196, 196, 0.4)",
      borderRadius: "4px",
      pointerEvents: "none",
      whiteSpace: "pre",
      zIndex: "50",
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);

    this.onKey = (e: KeyboardEvent) => {
      if (e.code === toggleCode) this.toggle();
    };
    window.addEventListener("keydown", this.onKey);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? "block" : "none";
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? "block" : "none";
  }

  update(stats: FrameStats): void {
    if (!this.visible) return;
    // Exponential smoothing so the number is readable rather than flickering.
    this.smoothedMs += (stats.frameMs - this.smoothedMs) * 0.1;
    const fps = this.smoothedMs > 0 ? Math.round(1000 / this.smoothedMs) : 0;
    this.el.textContent = [
      `fps   ${fps}`,
      `frame ${this.smoothedMs.toFixed(2)} ms`,
      `sim   ${stats.simSteps} steps`,
      `draws ${stats.drawCalls}`,
    ].join("\n");
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
