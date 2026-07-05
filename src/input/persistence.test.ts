import { describe, it, expect, beforeEach } from "vitest";
import { loadInput, saveInput, saveGameplay, clearInput } from "./persistence.ts";
import { DEFAULT_BINDINGS, DEFAULT_INPUT_SETTINGS } from "./defaults.ts";
import { DEFAULT_GAMEPLAY } from "../settings/gameplay.ts";

// Minimal in-memory localStorage so persistence can be tested under Node.
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("input persistence", () => {
  it("returns defaults when nothing is stored", () => {
    const loaded = loadInput();
    expect(loaded.binds).toEqual(DEFAULT_BINDINGS);
    expect(loaded.settings).toEqual(DEFAULT_INPUT_SETTINGS);
  });

  it("round-trips custom binds and settings", () => {
    const binds = { ...DEFAULT_BINDINGS, jump: "KeyJ" };
    const settings = { ...DEFAULT_INPUT_SETTINGS, lookSensitivity: 3.5, invertY: true };
    saveInput(binds, settings);
    const loaded = loadInput();
    expect(loaded.binds.jump).toBe("KeyJ");
    expect(loaded.settings.lookSensitivity).toBe(3.5);
    expect(loaded.settings.invertY).toBe(true);
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("fort.input", "{not valid json");
    const loaded = loadInput();
    expect(loaded.binds).toEqual(DEFAULT_BINDINGS);
  });

  it("coerces a partial payload, filling gaps with defaults", () => {
    localStorage.setItem(
      "fort.input",
      JSON.stringify({ binds: { jump: "KeyJ" }, settings: { lookSensitivity: 2 } }),
    );
    const loaded = loadInput();
    expect(loaded.binds.jump).toBe("KeyJ");
    // Missing binds default.
    expect(loaded.binds.moveForward).toBe("KeyW");
    // Missing settings default.
    expect(loaded.settings.targetingSensitivity).toBe(
      DEFAULT_INPUT_SETTINGS.targetingSensitivity,
    );
    expect(loaded.settings.lookSensitivity).toBe(2);
  });

  it("ignores non-finite and wrong-typed settings values", () => {
    localStorage.setItem(
      "fort.input",
      JSON.stringify({ settings: { lookSensitivity: "fast", invertY: "yes" } }),
    );
    const loaded = loadInput();
    expect(loaded.settings.lookSensitivity).toBe(DEFAULT_INPUT_SETTINGS.lookSensitivity);
    expect(loaded.settings.invertY).toBe(false);
  });

  it("clears stored input", () => {
    saveInput(DEFAULT_BINDINGS, DEFAULT_INPUT_SETTINGS);
    clearInput();
    expect(localStorage.getItem("fort.input")).toBeNull();
  });

  it("returns default gameplay toggles when nothing is stored", () => {
    expect(loadInput().gameplay).toEqual(DEFAULT_GAMEPLAY);
  });

  it("round-trips gameplay toggles without clobbering binds/settings", () => {
    saveInput({ ...DEFAULT_BINDINGS, jump: "KeyJ" }, { ...DEFAULT_INPUT_SETTINGS, fov: 100 });
    saveGameplay({ turboBuild: false, confirmEditOnRelease: true, resetEditOnRelease: true });
    const loaded = loadInput();
    expect(loaded.gameplay).toEqual({
      turboBuild: false,
      confirmEditOnRelease: true,
      resetEditOnRelease: true,
    });
    // The earlier binds and settings survive the gameplay write.
    expect(loaded.binds.jump).toBe("KeyJ");
    expect(loaded.settings.fov).toBe(100);
  });

  it("saveInput preserves a previously stored gameplay block", () => {
    saveGameplay({ turboBuild: false, confirmEditOnRelease: false, resetEditOnRelease: true });
    saveInput({ ...DEFAULT_BINDINGS, jump: "KeyK" }, DEFAULT_INPUT_SETTINGS);
    const loaded = loadInput();
    expect(loaded.gameplay.resetEditOnRelease).toBe(true);
    expect(loaded.binds.jump).toBe("KeyK");
  });
});
