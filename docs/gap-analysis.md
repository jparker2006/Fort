# Fort Phase 2 Gap Analysis: Ranked Delta Table

Status: Phase 2 of the Fortnite parity brief (`docs/fortnite-parity-brief.md`).
This turns the research (`docs/research.md`, the "Fortnite does X" column) and the
audit (`docs/audit.md`, the "Fort does Y" column) into one ranked, ordered work
list. Each meaningful item is a delta: Fortnite X (with source and confidence),
Fort Y (with file), the numeric delta, why it matters for feeling identical, and a
rough effort size.

This document ranks and describes. It does not design the fixes (that is Phase 3,
`docs/design.md`) and it changes no code.

## How this list is ranked

Two rules from the brief drive the order:

1. Primary sort key is how much closing the gap makes Fort feel identical to
   Fortnite.
2. Hard constraint (locked decision 1): every mechanics item is sequenced ahead of
   every pure-visual item, regardless of the visual item's impact. So the list is
   a mechanics block (ranked by feel impact) followed by a visual block (ranked by
   look impact).

Each row is tagged M (mechanics) or V (visual). Effort is a rough T-shirt size
(S, M, L) with two flags where they apply: "high-blast-radius" (touches
`src/world/grid.ts` or the persistence schema) and "feel-gated" (movement, jump,
camera, or animation change that should stop for human approval, mirroring how
`TICKETS.md` batches feel-gated work).

Confidence caveat: several high-impact mechanics deltas depend on Fortnite
movement numbers that Phase 1 could only source at low confidence (Epic does not
publish exact speeds, jump, or gravity). Those rows are marked "X low-conf" and
should be confirmed by in-game measurement before a value is committed. The
build-dimension and proportion deltas, by contrast, rest on Epic primary sources
and are high confidence.

Source IDs (E1, F1, etc.) refer to the ledger in `docs/research.md`.

## Ranked master list

| # | Item | Type | Delta (Fortnite X vs Fort Y) | X conf | Effort | Feel impact |
|---|---|---|---|---|---|---|
| 1 | Build-grid-to-player scale and wall:player proportion | M | wall:player 2.0 vs 1.67 (Fort ratio 83% of Fortnite); cell 5.12 m vs 4.0 m (-22%); wall 3.84 m vs 3.0 m (-22%) | high | L, high-blast-radius | High |
| 2 | Turbo build cadence | M | 0.05 s / 20 per s classic vs 0.10 s / 10 per s (Fort is 2x slower) | medium | S | High |
| 3 | Player traversal speed relative to the build grid | M | cross one cell in 1.02 s vs 0.73 s (Fort 40% faster per cell) | medium | S to M, feel-gated | High |
| 4 | Jump height relative to a wall | M | apex ~0.95 m (~25% of wall) vs 1.5 m (50% of wall); Fort jumps ~58% higher | low | S, feel-gated | Med-High |
| 5 | Sprint model: stamina limit and sprint-jump boost | M | stamina-limited, forward-only, higher jump while sprinting vs no stamina, no sprint-jump | high (behavior) | M | Med |
| 6 | Material maturation (spawn at half HP, mature to full) | M | spawn ~50% HP then ramp over a few seconds vs placed at full HP | medium | M | Med |
| 7 | Gravity rise-vs-fall relative to Fortnite | M | Fortnite split unpublished vs Fort rise 15.41 / fall 26.0 | low | S, feel-gated | Low-Med |
| 8 | Edit grids for floor, ramp, and cone tile counts | M | floor claimed 3x3 (likely 2x2) vs Fort 2x2; ramp/cone counts to confirm | low | S to M | Low-Med |
| 9 | Material HP ratio wood:stone:metal | M | ~1:2:2.7 (150/300/400) vs 1:1.5:2.5 (2/3/5 swings) | medium | S | Low |
| 10 | Turbo first-piece delay and same-spot destroy cooldown | M | first piece ~0.15 s, ~0.15 s re-place cooldown vs last-slot-differ guard only | medium | S | Low |
| 11 | Pickaxe weak-point and harvest economy | M | weak-point 2x damage, material harvest vs Mattock 1 HP/swing, unlimited materials | medium | M | Low (likely intentional) |
| 12 | Lighting depth: ambient bounce / soft global illumination | V | Lumen dynamic GI vs single directional + hemisphere, no GI | high | L | High (visual) |
| 13 | Art-direction richness and crafted material read | V | polished readable-stylized vs simpler procedural look | med | L | Med-High (visual) |
| 14 | Sky and world framing polish | V | crafted skies, biome dressing vs gradient sky, low-poly hills | med | M | Med (visual) |
| 15 | In-build ghost and piece material read | V | material-tinted translucent ghost vs flat blue ghost | med | S | Low-Med (visual) |
| 16 | HUD minimap placement and polish | V | minimap top-left vs Fort top-right; tray near-match | low-med | S | Low (visual) |
| 17 | Color grade and saturation tuning | V | high-key saturated grade vs Fort's current palette | low | M | Low (visual) |

## Mechanics deltas (detailed)

### 1. Build-grid-to-player scale and wall:player proportion (M, L, high-blast-radius)

- Fortnite X: wall height 384 uu (3.84 m), floor/cell footprint 512 uu (5.12 m),
  player height 192 uu (1.92 m), so a wall is exactly 2.0x player height and a
  cell is 2.67x player height. Source: E1, E3. Confidence: high (Epic primary).
- Fort Y: `CELL_HEIGHT` 3.0, `CELL_SIZE` 4.0 in `src/world/grid.ts`;
  `PLAYER.standHeight` 1.8 in `src/player/player-state.ts`. Wall is 1.667x player,
  cell is 2.22x player.
- Delta: Fort's wall:player ratio (1.667) is 83% of Fortnite's (2.0). Absolute
  cell (4.0 m) and wall (3.0 m) are each 22% smaller than Fortnite's, while the
  player (1.8 m) is only 6% smaller, so the player reads too large against the
  build grid. To restore 2.0 either `CELL_HEIGHT` rises to about 3.6 (+20%) or
  `standHeight` drops to about 1.5 (-17%).
- Why it matters (feel): how big the player reads against one build cell is a
  core Fortnite read the brief calls out directly. With a shorter wall, cover
  feels low, sightlines over a single wall open up, and the vertical geometry of
  a box fight is off. This is the foundational lattice every other build and
  collision behavior sits on.
- Effort: L, high-blast-radius. Any `CELL_HEIGHT`/`CELL_SIZE` change ripples
  through placement (`src/build/slots.ts`), colliders
  (`src/build/colliders.ts`, `src/build/variants.ts`), targeting
  (`src/build/targeting.ts`), edit grids (`src/edit/`), the world overlay
  (`src/world/island.ts`), and the minimap (`src/hud/minimap.ts`). A player-scale
  change instead ripples through camera, collision, and the animation squash. This
  is the single highest-blast-radius item and must be weighed deliberately.

### 2. Turbo build cadence (M, S)

- Fortnite X: turbo build places the first piece about 0.15 s after the build key
  is held, then subsequent pieces about every 0.05 s (about 20 pieces per second)
  in the classic era; the interval has been retuned across patches. Source: F1,
  D1. Confidence: medium.
- Fort Y: `TURBO_INTERVAL` 0.1 s (about 10 pieces per second) in
  `src/build/build-controller.ts:22`.
- Delta: Fort's turbo rate is half the classic Fortnite rate (0.1 s vs 0.05 s;
  10 per s vs 20 per s).
- Why it matters (feel): the fast wall-ramp-wall build rush is the single most
  recognizable Fortnite building feel. At half the rate, rapid building feels
  noticeably sluggish to anyone who knows the game. This is the top build-timing
  gap.
- Effort: S. One constant plus verification through `debug.perf` proxies. Note the
  instance pool pre-warm (`INITIAL_CAPACITY` 256) is tuned around the current
  cadence and should be re-checked if the rate doubles.

### 3. Player traversal speed relative to the build grid (M, S to M, feel-gated)

- Fortnite X: base run about 5.0 m/s (about 500 uu/s), so crossing one 5.12 m cell
  takes about 1.02 s. Source: community estimate (E8 substrate). Confidence: low on
  the speed, high on the cell size (E1).
- Fort Y: `MOVE.runSpeed` 5.5 in `src/player/movement-tuning.ts`; cell 4.0 m, so
  crossing one cell takes about 0.73 s.
- Delta: Fort crosses one build cell about 40% faster (0.73 s vs 1.02 s), driven
  mostly by the smaller cell (high confidence) and slightly by the faster run
  (Fort +10% over the estimate). Raw run speed alone is close (5.5 vs 5.0).
- Why it matters (feel): movement is read against the build grid, not in absolute
  meters. Because Fort's cell is smaller and its run is a touch faster, the player
  feels quick and the grid feels small, which changes the rhythm of running a
  wall line or rotating around a box. This couples to item 1; a scale decision
  there largely sets this.
- Effort: S to M, feel-gated. Coupled to item 1. If the grid is rescaled, this
  self-corrects; otherwise `MOVE.runSpeed` is the lever. Movement changes are
  feel-gated.

### 4. Jump height relative to a wall (M, S, feel-gated)

- Fortnite X: jump apex about 0.9 to 1.0 m (about 25% of a 3.84 m wall). Source:
  derived from E8 substrate. Confidence: low (needs measurement).
- Fort Y: `jumpApex()` about 1.5 units (1.5 m) from `MOVE.jumpSpeed` 6.8 and
  `MOVE.riseGravity` 15.41 in `src/player/movement-tuning.ts`; that is 50% of
  Fort's 3.0 m wall.
- Delta: Fort's jump reaches twice the fraction of a wall that Fortnite's does
  (50% vs about 25%), and is about 58% higher in absolute terms if the estimate
  holds. In Fort a player pops onto or over a single wall far more easily.
- Why it matters (feel): the jump-to-wall relationship governs whether a wall is
  real cover and whether you can hop your own builds. Fort currently feels
  floaty-tall relative to its walls. This is high impact but rests on a
  low-confidence X, so measure before committing a target.
- Effort: S, feel-gated. `jumpSpeed` and `riseGravity` are the levers; the arc
  is already covered by an automated apex test.

### 5. Sprint model: stamina limit and sprint-jump boost (M, M)

- Fortnite X: tactical sprint is stamina-limited (a bar drains, then the player
  drops back to jog), forward-only, lowers the weapon, and gives a higher and
  longer jump while sprinting. Source: E4, F2. Confidence: high on behavior.
- Fort Y: sprint is forward-dominant only and disabled while crouching
  (`src/player/movement.ts:52-53`), but there is no stamina limit and no
  sprint-jump boost; sprint speed is `MOVE.sprintSpeed` 6.6.
- Delta: Fort is missing the stamina drain/regen loop and the sprint-jump boost.
- Why it matters (feel): stamina-gated sprint is a Fortnite signature that shapes
  rotation and engagement pacing; the sprint-jump is a common traversal move. For
  a freebuild sandbox with no combat the stamina limit is lower stakes, which is
  why this sits mid-mechanics rather than at the top.
- Effort: M. A new stamina state with drain/regen, a HUD element, and gating of
  the sprint action, plus a small jump modifier while sprinting. Would add a
  rebindable-free behavior but no new key.

### 6. Material maturation: spawn at half HP, mature to full (M, M)

- Fortnite X: a freshly placed or edited structure spawns at roughly half its
  full HP and climbs to full over a few seconds. Source: M1. Confidence: medium.
- Fort Y: pieces are placed at full material HP immediately; `MATERIAL_HP` wood 2,
  stone 3, metal 5 in `src/build/build-model.ts:108`, applied on place.
- Delta: Fort has no maturation ramp; a new wall is instantly at full strength.
- Why it matters (feel): maturation is why a just-placed wall can be punched
  through briefly before it hardens; it shapes the tempo of taking and retaking
  builds. Lower stakes without combat, but it is a genuine behavior gap.
- Effort: M. A per-piece placement timestamp and an HP ramp, plus a visual cue if
  desired. Interacts with the Mattock swing-count model.

### 7. Gravity rise-vs-fall relative to Fortnite (M, S, feel-gated)

- Fortnite X: the rise-versus-fall gravity split is not published; the engine
  substrate default is a symmetric 980 uu/s^2. Source: E8. Confidence: low.
- Fort Y: asymmetric by design, `riseGravity` 15.41 and `fallGravity` 26.0 in
  `src/player/movement-tuning.ts` (floatier rise, snappier fall).
- Delta: Fort deliberately uses asymmetric gravity; whether Fortnite does is
  unverified. This may already be close in feel or may be a real difference.
- Why it matters (feel): the rise-vs-fall asymmetry is a big part of jump feel,
  but with no reliable Fortnite target this is a measure-first item, hence low to
  medium and near the bottom of mechanics.
- Effort: S, feel-gated. Constants only; couples to item 4.

### 8. Edit grids for floor, ramp, and cone tile counts (M, S to M)

- Fortnite X: wall edit grid is 3x3 (high confidence). Floor, ramp, and cone tile
  counts are less certain: one source groups floors with walls at 3x3 while the
  common understanding is 2x2 for floors and cones. Source: F1. Confidence: low
  for the floor/ramp/cone counts.
- Fort Y: 3x3 for walls, 2x2 for floor/stairs/roof (`src/edit/edit-grid.ts:28,32`).
- Delta: walls match (3x3). Floor may differ (Fortnite possibly 3x3 vs Fort 2x2);
  ramp and cone counts to confirm.
- Why it matters (feel): edit granularity determines which canonical shapes are
  reachable; a coarser floor grid means fewer floor-edit options. But because the
  Fortnite X is low confidence and Fort already matches the wall grid, this is a
  verify-then-maybe-adjust item.
- Effort: S to M. Changing a face-grid count touches `src/edit/edit-grid.ts` and
  the mask width in `src/edit/variants-catalog.ts` together. Confirm the real
  counts first.

### 9. Material HP ratio wood:stone:metal (M, S)

- Fortnite X: full-HP wood:brick:metal about 150:300:400, roughly 1:2:2.7. Source:
  M1. Confidence: medium.
- Fort Y: Mattock swing counts wood 2, stone 3, metal 5 (`MATERIAL_HP` in
  `src/build/build-model.ts:108`), a ratio of 1:1.5:2.5.
- Delta: Fort's stone is proportionally weaker relative to wood than Fortnite's
  (1.5x vs 2x); metal is close (2.5x vs 2.7x).
- Why it matters (feel): the relative toughness sets how many swings each material
  costs, but Fort models this abstractly as swing counts already close to the
  ratio, so the gap is small.
- Effort: S. Tune `MATERIAL_HP` and the Mattock damage relationship.

### 10. Turbo first-piece delay and same-spot destroy cooldown (M, S)

- Fortnite X: the first turbo piece lands about 0.15 s after holding, and there is
  about a 0.15 s cooldown before a piece can be re-placed where one was just
  destroyed. Source: F1. Confidence: medium.
- Fort Y: turbo fires on the held primary and only into a slot different from the
  last placed (`src/build/build-controller.ts` turbo timer); no explicit
  first-piece delay or same-spot destroy cooldown.
- Delta: Fort lacks the small first-piece delay and the destroy-then-replace
  cooldown.
- Why it matters (feel): these micro-timings shape the exact rhythm of a rush and
  prevent instant re-place spam. Polish-level once item 2 is set.
- Effort: S. Two small timers in the build controller.

### 11. Pickaxe weak-point and harvest economy (M, M, likely intentional)

- Fortnite X: the pickaxe deals about 75 to structures with a weak-point that
  doubles damage, and materials are harvested from the world. Source: G1.
  Confidence: medium.
- Fort Y: the Mattock deals 1 HP per swing (`src/build/destroy-controller.ts`),
  there is no weak-point, and materials are unlimited (HUD shows an infinity
  glyph, per the audit).
- Delta: Fort has no harvest economy and no weak-point mechanic.
- Why it matters (feel): the harvest loop is central to Battle Royale but Fort is
  explicitly a creative freebuild sandbox with unlimited materials, so this is
  likely an intentional difference rather than a parity gap. The weak-point is a
  minor missing flourish.
- Effort: M if pursued. Flagged as probably out of scope; confirm intent in Phase
  3.

## Visual deltas (detailed, all sequenced below mechanics)

### 12. Lighting depth: ambient bounce and soft global illumination (V, L)

- Fortnite X: Chapter 4+ uses Lumen fully dynamic real-time global illumination
  and reflections; the daytime mood is bright with soft filled shadows. Source:
  E5. Confidence: high.
- Fort Y: one directional sun plus a hemisphere light with `PCFSoftShadowMap`,
  no global illumination or ambient bounce (`src/world/island.ts` lighting,
  `src/core/game.ts` renderer).
- Delta: Fort's shadowed and undersides read flat and dark because nothing fills
  them; Fortnite's bounce keeps shadow areas colored and legible.
- Why it matters (feel): filled, soft lighting is a big part of the readable-
  stylized look and of how builds read in shade. Highest-impact visual item.
- Effort: L. Real GI is out of scope in vanilla Three.js; an approximation
  (stronger hemisphere/ambient, a cheap ambient-occlusion or fake bounce term,
  tuned shadow softness) is the realistic path. Design is Phase 3.

### 13. Art-direction richness and crafted material read (V, L)

- Fortnite X: polished readable-stylized art with crafted, slightly exaggerated
  forms and clean color separation. Source: E6, B1, B2. Confidence: medium.
- Fort Y: a simpler procedural look (flat grass texture, low-poly hills, gradient
  sky, procedural wood/stone/metal), per the audit and the Phase 0 screenshots.
- Delta: Fort reads as clean but minimal and programmer-authored next to
  Fortnite's crafted stylization; material surfaces are flatter.
- Why it matters (feel): the overall crafted quality is what makes Fortnite read
  as a polished world. Broad, lower-priority than lighting because it is diffuse
  rather than a single lever.
- Effort: L. Broad; should be decomposed in Phase 3 into per-surface passes.

### 14. Sky and world framing polish (V, M)

- Fortnite X: bright, crafted skies and dressed, clearly-themed biomes with long
  draw distance. Source: E6, B2. Confidence: medium.
- Fort Y: a procedural gradient sky with a two-lobe sun glow, a low-poly hill
  ring, a water ring, and horizon fog (`src/world/sky.ts`, `src/world/island.ts`).
- Delta: Fort's world framing is decent but sparse; the sky and horizon are
  simpler and the world has little dressing.
- Why it matters (feel): world framing sets the establishing read; Fort is
  already in the right family (gradient sky, sun glow, hills) so this is polish.
- Effort: M. Sky shader and world-dressing refinements.

### 15. In-build ghost and piece material read (V, S)

- Fortnite X: the placement ghost reads as a material-tinted translucent preview
  of the actual piece; valid vs invalid is color-coded. Source: F1. Confidence:
  medium.
- Fort Y: a flat translucent blue (valid) or red (invalid) ghost
  (`src/build/ghost.ts`, `VALID_COLOR` 0x2f7fff, `INVALID_COLOR` 0xff3b30).
- Delta: Fort's ghost is a flat color rather than a material-tinted preview. The
  valid/invalid color language itself already matches in concept (and Fort's
  hues are original by rule 2).
- Why it matters (feel): a material-tinted ghost reads more like the piece you are
  about to place. Minor visual refinement.
- Effort: S. Ghost material change; keep the valid/invalid signaling.

### 16. HUD minimap placement and polish (V, S)

- Fortnite X: the minimap sits top-left; the build tray and material indicator sit
  at the bottom. Source: general community layout. Confidence: low-med.
- Fort Y: minimap top-right (`src/hud/minimap.ts`, `#minimap` CSS), tray and
  material bottom-right, mode chip present (`src/hud/hud.ts`).
- Delta: minimap corner differs (top-right vs top-left); the rest of the hierarchy
  already matches closely.
- Why it matters (feel): minor placement familiarity. Keybinds (Fort Z/X/C/V vs
  Fortnite F1 to F4) are intentionally original and rebindable, so not a gap.
- Effort: S (CSS position). Low priority.

### 17. Color grade and saturation tuning (V, M)

- Fortnite X: a bright, high-key, saturated grade. Source: E6, B2. Confidence: low.
- Fort Y: a saturated green-and-blue palette already, per the Phase 0 screenshots.
- Delta: Fort is already reasonably saturated; a grade pass could push warmth and
  key to match more closely.
- Why it matters (feel): overall color mood; lowest-priority visual since Fort is
  already in the right register.
- Effort: M. A post or lighting/tone tuning pass.

## Already aligned (no action needed)

Fort already matches Fortnite on these, so Phase 3 and 4 should not spend effort
here:

- Footprint-to-height ratio 4:3 (Fort `grid.ts` matches Epic E1).
- Targeting model: walls snap to the nearest cell edge, floors to the aimed cell,
  ramps face away from the player (audit targeting vs F1).
- Edit gesture: hold to edit, drag-select tiles, reset, confirm on press or on
  release toggle (audit `src/edit/` vs F1).
- Wall edit grid 3x3 (audit vs F1).
- Canonical edit shapes: window, door, half wall, cone corner, ramp re-face, floor
  hole are all in the variants catalog (audit vs research area 6).
- Ghost valid/invalid color language: both color-code validity (concept match).
- Third-person over-the-shoulder camera (audit `camera-rig.ts` vs E7).
- Crouch speed ratio: Fort 2.8/5.5 = 0.51 sits inside the estimated Fortnite range.
- Run and sprint speeds within about 10% of the community estimates (5.5 vs ~5.0,
  6.6 vs ~6.4).
- No outline or toon pass (both rely on silhouette, color, and lighting).
- HUD hierarchy: center crosshair, bottom build tray plus material indicator, a
  mode indicator, and a minimap (positions aside).
- Distinct wood, stone, metal materials.
- Unlimited materials in freebuild (Fort by design; Fortnite Creative similar).

## Cross-cutting flags carried forward

- High-blast-radius: item 1 (any `src/world/grid.ts` scale change) is the top
  item and the highest-risk change in the tree; Phase 3 must flag it in its
  dedicated section, and Phase 4 should make it its own precondition ticket.
- Feel-gated: items 3, 4, 5, 7 (traversal, jump, sprint, gravity) are movement and
  should stop for human approval, matching how `TICKETS.md` batches feel-gated
  work.
- Measure-first: items 3, 4, 7 depend on low-confidence Fortnite movement numbers;
  the exact target should be measured in-game (or Fort's tuned value accepted)
  before a number is committed. This directly answers the open questions in
  `docs/research.md`.
- Likely out of scope: item 11 (harvest economy) is probably an intentional Fort
  difference; confirm in Phase 3 rather than assume.

## Deliverable status

- `docs/gap-analysis.md` (this file): complete. It cites the audit (Y with files)
  and the research (X with sources), ranks by feel-identical impact with all
  mechanics ahead of all visuals, tags each row mechanics or visual, and gives a
  rough effort with high-blast-radius and feel-gated flags.
- Next phase (not started): Phase 3 design, which proposes concrete,
  architecture-fitting changes with an original-asset approach and a test plus
  evidence plan per change, sequenced to match this ranking. Per the model table,
  Phase 3 runs on Fable 5.
