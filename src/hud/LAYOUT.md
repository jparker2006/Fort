# HUD Layout Spec

Fort's HUD mirrors the information hierarchy and screen positions of Fortnite
Battle Royale creative freebuild, with fully original art (see `icons.ts`). No
health, shield, or ammo elements exist because Fort has no combat.

```
+--------------------------------------------------------------+
|                                                              |
|                                                              |
|                        [ crosshair ]        <- screen center |
|                                                              |
|                                                              |
|                                                              |
|                                          Build   <- mode chip|
|                             +------------------+  +--------+ |
|                             | Wall Floor Stair | |  wood  | |
|                             | Roof   (tray)    | |   inf  | |
|                             +------------------+  +--------+ |
|                                        (tray)     (material) |
+--------------------------------------------------------------+
```

Positions:

- **Crosshair**: exact screen center. Three variants switch by mode: a square
  bracket frame (build), a ring (edit), a ticked dot (Mattock / movement).
- **Piece tray**: bottom-right, four slots in build order (Wall, Floor, Stairs,
  Roof). Each slot shows an original piece icon and its live key label pulled
  from the binding system (never hardcoded). The active piece slot is
  highlighted while in build mode.
- **Material indicator**: immediately right of the tray, showing the active
  material icon (wood grain, brick stone, riveted metal) and an infinity glyph
  for the unlimited quantity.
- **Mode chip**: above the tray, reading Build / Edit / Mattock.

Scaling: every dimension is expressed in viewport-relative units
(`clamp(min, vmin, max)`), so the HUD scales cleanly from 1280x720 up to 4K
without overlapping or clipping. The overlay is `pointer-events: none` so it
never intercepts gameplay input; the settings menu (T17) is a separate
interactive layer.
```
