// Gameplay toggles, separate from input bindings and sensitivity. T11 reads
// turboBuild; T13 reads the edit-on-release toggles. The settings menu (T17)
// drives and persists these; until then they hold their documented defaults.

export interface GameplaySettings {
  /** Hold primary fire to keep placing into fresh valid slots (ramp rush). */
  turboBuild: boolean;
  /** Apply an edit when the edit bind is released, rather than on confirm. */
  confirmEditOnRelease: boolean;
  /** Reset an edit selection when the reset bind is released. */
  resetEditOnRelease: boolean;
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  turboBuild: true,
  confirmEditOnRelease: false,
  resetEditOnRelease: false,
};
