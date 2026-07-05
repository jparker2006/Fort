import { ACTIONS, ACTION_META } from "./actions.ts";
import type { InputSystem } from "./input-system.ts";
import { formatBindLabel } from "./bindings.ts";

// Developer overlay listing every action, its current bind, and live down
// state. Toggled with Backslash. Satisfies the T04 requirement that the debug
// overlay show pressed/released state for every bind.

export class DebugInputOverlay {
  private readonly el: HTMLDivElement;
  private visible = false;
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(
    parent: HTMLElement,
    private readonly input: InputSystem,
    toggleCode = "Backslash",
  ) {
    this.el = document.createElement("div");
    this.el.id = "debug-input-overlay";
    Object.assign(this.el.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      padding: "8px 10px",
      font: "11px ui-monospace, Menlo, Consolas, monospace",
      color: "#cfeeee",
      background: "rgba(6, 18, 22, 0.72)",
      border: "1px solid rgba(51, 196, 196, 0.4)",
      borderRadius: "4px",
      pointerEvents: "none",
      whiteSpace: "pre",
      zIndex: "50",
      display: "none",
      lineHeight: "1.5",
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

  update(): void {
    if (!this.visible) return;
    const rows = ACTIONS.map((a) => {
      const down = this.input.isDown(a);
      const dot = down ? "[*]" : "[ ]";
      const label = ACTION_META[a].label.padEnd(22, " ");
      const bind = formatBindLabel(this.input.bindings.get(a));
      return `${dot} ${label} ${bind}`;
    });
    this.el.textContent = ["ACTIONS (down = *)", ...rows].join("\n");
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
