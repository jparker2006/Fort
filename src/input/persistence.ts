import { ACTIONS, type Action } from "./actions.ts";
import { DEFAULT_BINDINGS, DEFAULT_INPUT_SETTINGS } from "./defaults.ts";
import type { InputSettings } from "./sensitivity.ts";

// Versioned localStorage persistence for binds and input settings. Loading is
// tolerant: a missing, unparseable, or older payload falls back to defaults for
// any field it cannot supply, so a schema change never bricks the game.

const STORAGE_KEY = "fort.input";
const CURRENT_VERSION = 1;

export interface PersistedInput {
  version: number;
  binds: Record<Action, string>;
  settings: InputSettings;
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
  };
}

export function loadInput(): PersistedInput {
  const ls = safeLocalStorage();
  const fallback: PersistedInput = {
    version: CURRENT_VERSION,
    binds: { ...DEFAULT_BINDINGS },
    settings: { ...DEFAULT_INPUT_SETTINGS },
  };
  if (!ls) return fallback;
  const text = ls.getItem(STORAGE_KEY);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { version?: number } & Record<string, unknown>;
    return migrate(parsed);
  } catch {
    return fallback;
  }
}

export function saveInput(binds: Record<Action, string>, settings: InputSettings): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const payload: PersistedInput = { version: CURRENT_VERSION, binds, settings };
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked; binds simply will not persist this session.
  }
}

export function clearInput(): void {
  safeLocalStorage()?.removeItem(STORAGE_KEY);
}
