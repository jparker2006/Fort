import { ACTIONS, type Action } from "./actions.ts";
import { DEFAULT_BINDINGS, DEFAULT_INPUT_SETTINGS } from "./defaults.ts";
import type { InputSettings } from "./sensitivity.ts";
import { DEFAULT_GAMEPLAY, type GameplaySettings } from "../settings/gameplay.ts";

// Versioned localStorage persistence for binds, input settings, and gameplay
// toggles. Loading is tolerant: a missing, unparseable, or older payload falls
// back to defaults for any field it cannot supply, so a schema change never
// bricks the game. Version 2 added the gameplay block.

const STORAGE_KEY = "fort.input";
const CURRENT_VERSION = 2;

export interface PersistedInput {
  version: number;
  binds: Record<Action, string>;
  settings: InputSettings;
  gameplay: GameplaySettings;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function coerceSettings(raw: unknown): InputSettings {
  const s = { ...DEFAULT_INPUT_SETTINGS };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const key of Object.keys(s) as Array<keyof InputSettings>) {
      const v = r[key];
      if (key === "invertY") {
        if (typeof v === "boolean") s.invertY = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        (s[key] as number) = v;
      }
    }
  }
  return s;
}

function coerceGameplay(raw: unknown): GameplaySettings {
  const g = { ...DEFAULT_GAMEPLAY };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const key of Object.keys(g) as Array<keyof GameplaySettings>) {
      if (typeof r[key] === "boolean") g[key] = r[key] as boolean;
    }
  }
  return g;
}

function coerceBinds(raw: unknown): Record<Action, string> {
  const binds: Record<Action, string> = { ...DEFAULT_BINDINGS };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const a of ACTIONS) {
      const v = r[a];
      if (typeof v === "string") binds[a] = v;
    }
  }
  return binds;
}

// Migrate an older payload forward. Currently only v1 exists; the switch is the
// seam future versions add cases to.
function migrate(parsed: { version?: number } & Record<string, unknown>): PersistedInput {
  const version = typeof parsed.version === "number" ? parsed.version : 0;
  // No historical migrations yet; coercion handles field-level gaps.
  void version;
  return {
    version: CURRENT_VERSION,
    binds: coerceBinds(parsed.binds),
    settings: coerceSettings(parsed.settings),
    gameplay: coerceGameplay(parsed.gameplay),
  };
}

function defaults(): PersistedInput {
  return {
    version: CURRENT_VERSION,
    binds: { ...DEFAULT_BINDINGS },
    settings: { ...DEFAULT_INPUT_SETTINGS },
    gameplay: { ...DEFAULT_GAMEPLAY },
  };
}

export function loadInput(): PersistedInput {
  const ls = safeLocalStorage();
  if (!ls) return defaults();
  const text = ls.getItem(STORAGE_KEY);
  if (!text) return defaults();
  try {
    const parsed = JSON.parse(text) as { version?: number } & Record<string, unknown>;
    return migrate(parsed);
  } catch {
    return defaults();
  }
}

// Persist binds + input settings, preserving the stored gameplay block (the
// input system is the caller and does not own gameplay toggles).
export function saveInput(binds: Record<Action, string>, settings: InputSettings): void {
  writePayload({ binds, settings });
}

// Persist gameplay toggles, preserving the stored binds + input settings.
export function saveGameplay(gameplay: GameplaySettings): void {
  writePayload({ gameplay });
}

function writePayload(patch: Partial<Omit<PersistedInput, "version">>): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const current = loadInput();
  const payload: PersistedInput = { ...current, ...patch, version: CURRENT_VERSION };
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked; settings simply will not persist this session.
  }
}

export function clearInput(): void {
  safeLocalStorage()?.removeItem(STORAGE_KEY);
}
