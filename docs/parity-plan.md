# Fort Parity Plan: Tickets T22 to T36 (Run B)

Status: Phase 4 of `docs/fortnite-parity-brief.md`. This is the ordered,
ticket-style implementation plan for the changes designed in
`docs/design.md`, which close the gaps ranked in `docs/gap-analysis.md`.
Numbering continues from the shipped T01 to T21 in `TICKETS.md`, and numeric
order is execution order. Each ticket is small enough to verify on its own,
carries explicit acceptance criteria and the exact tests that prove it, and
is tagged with the model that should build it (mechanics and correctness on
Opus 4.8, visual and styling on Fable 5, per the brief's model table).

This plan proposes work. Nothing here is built. The presentation of this
plan through native plan mode is the stop gate; a human approves before any
ticket starts. This revision incorporates an engineering review
(/plan-eng-review with a Codex outside voice); the review report is the
final section of this file.

Scale claim, stated precisely: the plan matches Fortnite's PROPORTIONS
exactly (wall:player 2.00, cell:player 2.67, footprint:height 4:3) at
93.75 percent of Fortnite's absolute scale (Fort 4.8 m cell / 1.8 m player
vs Fortnite 5.12 m / 1.92 m). Absolute-dimension parity is not claimed.

## Rules that bind every ticket (restated per the brief)

1. Headless testability: mechanics are proven through `game.stepForTest()`
   and `window.__fort.debug.pump(frames)`; performance claims use the
   deterministic proxies (`debug.build.drawCalls()`,
   `debug.build.colliderCount()`, `debug.perf.nearComparisons()`,
   `debug.perf.poolGrows()`), never wall-clock fps.
2. Action map only: no hardcoded keys. This plan adds ZERO new actions and
   ZERO new settings, so `src/input/defaults.ts` and
   `src/input/persistence.ts` (CURRENT_VERSION 2) are untouched end to end.
   If any review decision adds a toggle, that ticket must bump the schema
   version and extend the coercion, and it must say so in its diff.
3. `src/world/grid.ts` stays the single source of truth. Exactly one ticket
   (T23) edits it, behind an unconditional human gate.
4. InstancedMesh pooling stays; no per-piece meshes.
5. Original assets only: procedural canvas, code-built geometry, GLSL,
   DOM/CSS. No Epic file of any kind. The hero stays the blank / original
   skin (`src/character/DESIGN.md`).
6. No em dashes anywhere; every ticket ends with `npm run check` green
   (typecheck, zero-warning lint, no-em-dash scan) and the canonical verify
   suite (`npm run test:verify`) green.

Feel-gated tickets (marked FEEL-GATED) stop for human hand-feel approval
even when all tests pass, mirroring how T05/T06/T08 were gated in
`TICKETS.md`.

## Sequencing at a glance

| Ticket | Title | Model | Flags |
|---|---|---|---|
| T22 | Derive reach and bucket constants from grid | Opus 4.8 | no-op refactor, de-risks T23 |
| T23 | Rescale the lattice to 4.8 x 3.6 | Opus 4.8 | HIGH-BLAST-RADIUS, unconditional gate |
| T24 | Roof piece to half-wall peak | Opus 4.8 | |
| T25 | Turbo cadence, first-piece delay, replace cooldown | Opus 4.8 | |
| T26 | Parity observation pass (movement, edit grids, minimap) | Opus 4.8 | research task, timeboxed, never blocks |
| T27 | Traversal speed retune | Opus 4.8 | FEEL-GATED (batch with T28), consumes T26 |
| T28 | Jump arc retune | Opus 4.8 | FEEL-GATED (batch with T27), consumes T26 |
| T29 | Sprint stamina and sprint-jump | Opus 4.8 | FEEL-GATED, gate may cut or soften |
| T30 | Material HP ladder and maturation | Opus 4.8 | |
| T31 | Lighting rig and ACES grade | Fable 5 | first visual ticket |
| T32 | Build material textures v2 | Fable 5 | after T31 (palette module) |
| T33 | Sky v2: three-stop gradient and clouds | Fable 5 | CI-budget gated, named fallback |
| T34 | Material-tinted ghost | Fable 5 | after T32 (final material hues) |
| T35 | HUD chrome pass | Fable 5 | consumes T26 minimap verdict |
| T36 | After-evidence set and verify suite refresh | Opus 4.8 | closes Run B |

Mechanics (T22 to T30) strictly precede visuals (T31 to T35) in landing
order, matching the gap ranking and locked decision 1. T23 must land before
T27/T28 (speeds and jump are tuned against the new cell). T26 must land
before T27/T28/T35 (they consume its observations). T36 is last.

Dependency lanes (work can parallelize where lanes are independent; MERGE
order still respects mechanics-first):

```
Lane A (core build):   T22 -> T23 -> T24 -> T25 -> T30
Lane B (observation):  T26  (docs only; parallel with Lane A)
Lane C (movement):     T27 -> T28 -> T29   (needs A:T23 and B:T26)
Lane D (visuals):      T31 -> T32 -> T33   (lands after C)
Lane E (visual leaf):  T34 (after T32), T35 (after B:T26, parallel with D)
Bookend:               T36 (after everything)
Conflict flag: Lanes A and C both touch src/player/ (collision.ts in T22,
movement files in C). Run sequentially or coordinate that directory.
```

## Tickets

### T22: Derive reach and bucket constants from grid (Opus 4.8)

Convert the four constants that restate grid-derived sizes as literals into
expressions of `CELL_SIZE`, at the CURRENT scale, changing no behavior:

- `BUILD_REACH = 3 * CELL_SIZE` in `src/build/targeting.ts` (12 today).
- `EDIT_REACH = 2.25 * CELL_SIZE` in `src/edit/edit-controller.ts` (9).
- `MATTOCK_REACH = 2.25 * CELL_SIZE` in `src/build/destroy-controller.ts` (9).
- `BUCKET = 2 * CELL_SIZE` in `src/player/collision.ts` (8). This is a
  deliberate new grid import into collision.ts (its only one), and `BUCKET`
  becomes exported so the pin test can assert it.

Also audited and deliberately KEPT absolute (documented at the site, per
review decision 1A): the `+ 0.5` storey bias in `buildLevel()`
(`src/build/targeting.ts:43`) is a tolerance, not geometry; it stays 0.5 at
any scale, and the comment must say so.

This is a pure no-op refactor that makes T23's rescale diff a two-line
values change instead of a hunt for stale literals.

Acceptance criteria:
- All four constants evaluate to their current values (12, 9, 9, 8);
  `BUCKET` is exported and pinned by the new Vitest.
- The only new grid import is in collision.ts; no other file gains one.
- Zero behavior change: the full Playwright suite passes unmodified.
- The storey-bias keep-absolute comment exists at targeting.ts.

Tests: existing suites unchanged and green (`npm run test`); a new Vitest
pinning the four derived values at current scale so T23's diff shows them
moving deliberately.

### T23: Rescale the lattice to 4.8 x 3.6 (Opus 4.8, HIGH-BLAST-RADIUS)

GATE (unconditional, per review decision 2A): this ticket ALWAYS opens by
re-confirming the scale decision with a human, regardless of what was
approved at plan time. No implicit approval carries over.

The change, in `src/world/grid.ts` only:
- `CELL_SIZE` 4 becomes 4.8; `CELL_HEIGHT` 3 becomes 3.6.

Companion edits inside this ticket:
- `STAIR_STEPS` 6 becomes 7 in `src/build/colliders.ts` (tread 0.514 keeps
  margin under `MOVE.stepHeight` 0.6; at 6 steps the tread would sit exactly
  on the boundary).
- Test-coordinate sweep: every spec that teleports to or asserts literal
  world coordinates is updated (`tests/*.spec.ts`, `tests/verify.spec.ts`,
  `tests/before-evidence.spec.ts`, colocated `src/**/*.test.ts` where they
  assume cell size). Prefer converting literals to `CELL_SIZE`-derived
  expressions while sweeping, so this never repeats.

Why: wall:player becomes 3.6 / 1.8 = 2.00 and cell:player 4.8 / 1.8 = 2.67,
matching Fortnite's proportions exactly (Epic primary sources;
`docs/research.md` E1/E3) at 93.75 percent absolute scale. The 4:3 ratio is
preserved. Blast radius is enumerated in `docs/design.md` Part 3; T22
already fenced the stale-literal risk.

Acceptance criteria:
- Grid constants report 4.8 / 3.6; derived reaches report 14.4 / 10.8 /
  10.8 / 9.6 (via the T22 pin test, updated deliberately in this diff).
- Proportion pins: wall:player asserts 2.00 and cell:player 2.67 in a new
  Vitest (reads `CELL_HEIGHT`, `CELL_SIZE`, `PLAYER.standHeight`).
- Stair walk: player walks a stair run to the top (Playwright through
  `debug`, final `playerPos().y` = 3.6 within tolerance); tread height
  asserts strictly less than `MOVE.stepHeight` minus 0.05 margin.
- Full flow green: place, edit window, destroy (verify suite) at the new
  scale.
- Collider and draw-call invariance, scoped correctly (review: Codex):
  `debug.build.drawCalls()` unchanged for the same piece count; collider
  count unchanged for wall/floor/roof pieces; STAIR pieces deliberately go
  from 6 to 7 boxes each, and the test asserts the new expected total.

Tests: updated grid Vitest; proportion Vitest; stair-run Playwright; the
full existing suite swept and green. Evidence: `after-proportions.png`
re-shooting the `before-player-proportions.png` composition; the hero now
reads half a wall tall.

### T24: Roof piece to half-wall peak (Opus 4.8)

Research says the cone peaks at about half a wall, not a full wall
(`docs/research.md`, medium confidence; the full-height claim was refuted).
Change `roofGeometry()` in `src/build/variants.ts` to a `CELL_HEIGHT / 2`
peak and rebuild `roofColliders()` in `src/build/colliders.ts` to the same
envelope.

Boundary trap (review: Codex): at a 1.8 peak, keeping `ROOF_LAYERS` 3 gives
0.6 layer rises, exactly `MOVE.stepHeight`, recreating the stair boundary
bug this plan just fixed. `ROOF_LAYERS` becomes 4 (0.45 rises) and the
margin is asserted, same trap-test pattern as stairs.

Acceptance criteria:
- Roof visual peak and top collider both sit at `CELL_HEIGHT / 2` within
  epsilon (Vitest on collider boxes; geometry bounding box check).
- Roof collider layer rise asserts strictly less than `MOVE.stepHeight`
  minus 0.05 margin.
- A player standing on a roof apex stands at cell base + 1.8, asserted
  through `debug` teleport-and-settle.
- Roof edit variants (`roof#h`, `roof#c`) still resolve and place; edit
  spec green.

Tests: collider Vitest; Playwright roof-stand and roof-edit; evidence
`after-fort-structure.png` re-shooting the closed-hut composition.

### T25: Turbo cadence, first-piece delay, replace cooldown (Opus 4.8)

In `src/build/build-controller.ts`: `TURBO_INTERVAL` 0.1 becomes 0.05; new
`TURBO_FIRST_DELAY` 0.15 between the initial tap-place and the first turbo
repeat (a single click still places instantly).

Replace cooldown, designed at the removal seam (review: Codex): the
cooldown state lives in `src/build/build-model.ts` and is written by
`removeAt` itself, so every removal path (Mattock destroy, debug removal,
any future collapse) is covered; there are no holes. Time source: the model
gains a `tick(dt)` advancing an internal sim-time accumulator, driven from
`BuildSystem.fixedUpdate` at the fixed rate, so cooldown behavior is
deterministic and unit-testable without a browser. (`tick(dt)` is the same
mechanism T30's maturation uses; one clock, two consumers.)
`REPLACE_COOLDOWN` 0.15; the `recentlyFreed` map purges all expired entries
on every insert (review decision 4A), keeping it bounded by construction.

Pool check: a 100-piece rush at 20 per second is 5 seconds of hold;
`INITIAL_CAPACITY` 256 still swallows it without a grow.

Acceptance criteria:
- Cadence: hold primary fire 2 s of pumped frames while the test produces
  fresh targets (walk forward under held `moveForward`, or sweep yaw one
  step per interval through `debug.setYaw`; the spec states which). Piece
  count lands within one of the analytic expectation (about 38 to 39,
  accounting for the tap-place plus first-delay).
- Two quick taps place two pieces in different slots with no cross-slot
  delay (tap-tap flow).
- Same-slot cooldown: destroy a piece, immediate same-slot place rejected;
  after 0.15 s of pumped sim, accepted. A DIFFERENT slot places at t+0
  after the destroy (negative-space assert).
- Removal-seam coverage: a debug `removeFloor` also arms the cooldown
  (proves the seam, not just the Mattock path).
- Map boundedness: after a scripted destroy spree, the map size asserts
  less than or equal to destroys-in-flight within one cooldown window.
- 100-piece turbo row: `debug.perf.poolGrows()` = 0.
- Turbo still fully gated by the `turboBuild` gameplay toggle.

Tests: cadence, cooldown, seam, and bound Playwright/Vitest through `debug`
and `model.tick`; evidence `after-turbo-run.png` mid-rush.

### T26: Parity observation pass (Opus 4.8, research task, no src/ code)

Moved ahead of the feel retunes per review (cross-model consensus): the
movement estimates are the plan's weakest inputs, so the looking happens
before the tuning.

Observe current Fortnite (live game if available; otherwise current wiki,
patch notes, or gameplay video at known settings) and record, with date and
confidence, in `docs/research.md`:

1. Movement timing: seconds to cross one build tile at jog and at sprint,
   and apparent jump apex against a wall. Convert to Fort units.
2. Floor / ramp / cone edit tile counts (wall 3x3 is settled).
3. Minimap corner in current Fortnite BR.

Rules (review: Codex): timeboxed to roughly 30 minutes of observation; if a
source is unavailable, record "unverified, keeping Fort's current values"
per item and move on. This ticket NEVER blocks the run; its output is
numbers for T27/T28 and verdicts for T35 plus a possible follow-up scope
note for edit grids (a floor-grid change, if confirmed, is scoped as its
own future ticket touching `src/edit/edit-grid.ts` and
`src/edit/variants-catalog.ts` as a coupled pair; NOT built inside T26).

Acceptance criteria: dated verification notes exist in `docs/research.md`
for all three items (values or explicit "unverified, kept"); no file under
`src/` changed; `npm run check` green (docs scanned for em dashes).

### T27: Traversal speed retune (Opus 4.8, FEEL-GATED, batch with T28)

In `src/player/movement-tuning.ts`, starting values (T26's observed numbers
override these if they differ): `runSpeed` 5.5 becomes 4.7 (one 4.8 cell in
1.02 s), `sprintSpeed` 6.6 becomes 6.0 (cell in 0.8 s; ratio 1.28),
`crouchSpeed` 2.8 becomes 2.4 (preserves 0.51 crouch:run), `airMaxSpeed`
6.6 becomes 6.0.

Animation follow-through in `src/character/animation-controller.ts`: sprint
threshold 6.0 becomes 5.3 (below the new sprint speed); re-measure
`RUN_REFERENCE_SPEED` / `SPRINT_REFERENCE_SPEED` with the existing
animation calibration test so foot-plant slide stays low.

Acceptance criteria:
- Cell-crossing Vitest: `CELL_SIZE / MOVE.runSpeed` = 1.02 within 0.02
  (fails loudly if either side retunes alone).
- Playwright displacement, measured at speed (review: Codex): the test
  first holds forward until velocity reaches `runSpeed` within epsilon
  (spin-up from rest at groundAccel 60 costs about 0.18 units and 0.08 s),
  THEN measures a 1.02 s window and asserts displacement = one `CELL_SIZE`
  within tolerance.
- Animation picks sprint state at the new sprint speed; run cadence
  timeScale stays within its clamp band at the new speeds.
- FEEL GATE: a human plays the build and approves run, sprint, and crouch
  hand-feel before the ticket closes. If hands disagree with the observed
  or estimated numbers, the checkpoint adjusts the values and the paired
  test together.

Tests: as above. Evidence: none visual; the gate is the checkpoint.

### T28: Jump arc retune (Opus 4.8, FEEL-GATED, batch with T27)

In `src/player/movement-tuning.ts`: `jumpSpeed` 6.8 becomes 5.27,
`jumpApexTarget` 1.5 becomes 0.9 (T26's observed apex overrides if it
differs). `riseGravity` / `fallGravity` unchanged (Fortnite's split is
unpublished; Fort's asymmetric pair is a liked feel). Apex:wall becomes
0.9 / 3.6 = 25 percent. Check the 0.9 s jump clip in
`src/character/clips.ts` against the new analytic airtime (about 0.61 s)
and shorten the clip if the pose visibly lags landing.

Acceptance criteria:
- Existing analytic arc Vitest follows `jumpApexTarget` and passes at 0.9
  within tolerance.
- Playwright regression trap: from flat ground beside a full wall, a bare
  jump cannot mount the wall.
- Coyote and buffer behavior unchanged (existing movement spec green).
- FEEL GATE: same human checkpoint as T27, one session covering both.

Tests: as above. Evidence: `after-jump-vs-wall.png` at apex beside a wall.

### T29: Sprint stamina and sprint-jump (Opus 4.8, FEEL-GATED)

Premise note (review: Codex challenged stamina as BR-combat behavior in a
sandbox; kept by decision D9 because feels-identical is the locked top
priority and Fortnite Creative ships sprint stamina too). The feel gate on
this ticket has explicit authority to CUT the drain or soften it (longer
`staminaMax`) if it reads as friction in freebuild; the sprint-jump boost
is uncontested and survives either way.

In `src/player/movement-tuning.ts` and `src/player/movement.ts`:
`staminaMax` 6.0 s, drain 1x while sprint-active, regen 2x while not (empty
to full in 3 s), sprint blocked at zero until stamina recovers above 15
percent. Sprint-jump: `jumpSpeed` x 1.10 when the jump STARTS while
sprinting (pressing sprint mid-air changes nothing).

Drain semantics, defined (review: Codex): sprint-active means the sprint
action is held, movement is forward-dominant, the player is grounded, and
not crouching (crouch already disables sprint per `movement.ts:53`).
Airborne freezes both drain and regen; landing resumes whichever applies.
Zero-stamina jump is a normal jump. Build, edit, and mattock modes do not
change sprint eligibility. No stamina cost on the jump itself.

State lives in `src/player/player-state.ts`. HUD: a slim CSS bar in
`src/hud/hud.ts`; the `HudSources` interface gains a `stamina()` accessor
wired in `src/main.ts` (review: Codex; the contract change is named, not
hidden). New debug probe `debug.player.stamina()`.

No new action, no new setting, no persistence change. If the feel gate asks
for a stamina-off toggle, that becomes a follow-up ticket bumping
`CURRENT_VERSION` to 3 and extending `coerceGameplay`.

Acceptance criteria:
- Vitest ladder: 6 s sprint drains to zero and target speed falls to run;
  3 s idle refills; re-engage only above 15 percent; sprint-jump apex =
  base apex x 1.21 (velocity multiplier squared).
- Edge asserts: crouch with sprint held drains nothing; airborne freezes
  drain; mid-air sprint press does not boost an in-flight jump.
- Playwright: hold sprint through pumped frames, `debug.player.stamina()`
  drains and the HUD bar element appears; bar hidden at full.
- FEEL GATE: human approves drain length and boost, or exercises the cut /
  soften authority above.

Tests: as above. Evidence: `after-stamina-hud.png` mid-drain.

### T30: Material HP ladder and maturation (Opus 4.8)

In `src/build/build-model.ts`: `MATERIAL_HP` wood 2 / stone 3 / metal 5
becomes wood 2 / stone 4 / metal 6 (Fortnite swings-to-break at full HP).
Pieces place at `ceil(half)` (1 / 2 / 3) and mature +1 HP per second to
full.

Determinism design (review decisions 3A + Codex): maturation is advanced by
the same `BuildModel.tick(dt)` that T25 added, driven from
`BuildSystem.fixedUpdate` at the sim rate (never the per-frame `update`
hook; gameplay state lives in the sim tick per the System contract in
`src/core/game.ts:10`). Unit tests advance maturation by calling
`model.tick(dt)` directly; no browser needed. The schedule is time-ordered
with a head-check early-exit so a 500-piece stress tick stays trivial.

Edit interaction, defined (review: Codex): `applyEdit` preserves HP AND the
maturation schedule continues unchanged; the schedule is keyed by slot key,
which `applyEdit` does not change. A half-mature edited piece keeps
hardening on its original clock.

Acceptance criteria:
- Vitest ladder: place wood, `hpAt` = 1; after 1 s of ticks, 2 and capped;
  stone 2 to 4 over 2 s; metal 3 to 6 over 3 s.
- One swing kills a fresh wood wall; two kill a matured one (Playwright).
- Edit mid-maturation: edit a half-mature stone wall, HP continues rising
  on schedule to 4.
- Destroy clears the schedule entry (no resurrection; count stays 0).
- Pause: with the game paused, pumped frames advance nothing; `hpAt`
  unchanged (fixedUpdate skips while paused).
- `debug.build.hpAt()` remains the single HP read used by tests.

Tests: as above. Evidence: none visual (numbers are the story).

### T31: Lighting rig and ACES grade (Fable 5)

The single biggest look win. In `src/core/game.ts`:
`renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure`
1.15. In `src/world/island.ts`: hemisphere intensity 0.9 becomes 1.25,
ground tint `#3a5233` becomes `#4a6b3a`, sky tint per the palette; sun
intensity 2.1 becomes 1.8, color toward `#ffe9b8`. Consolidate the
sky/fog/sun hex trio into one shared palette module consumed by
`src/world/island.ts` and `src/world/sky.ts`.

Ownership change, named (review: Codex): `World` currently discards its
light handles; this ticket has `World` retain references to the hemisphere
and sun lights and expose a small read API, and `src/main.ts` wires the new
`debug.world.lighting()` probe (tone mapping mode, exposure, per-light
intensities) from the game plus world handles.

Original-asset approach: values and code only; no image, no LUT file.

Acceptance criteria:
- `debug.world.lighting()` asserts the exact mode, exposure, and
  intensities (deterministic, no pixel reads).
- `debug.build.drawCalls()` unchanged for the same scene.
- Verify suite green; ghost hex assertions unaffected (ghost material is
  unlit `MeshBasicMaterial`).

Tests: probe Playwright; evidence `after-lighting-wide.png` and
`after-materials-lit.png` re-shooting the Phase 0 compositions.

### T32: Build material textures v2 (Fable 5)

In `src/build/materials.ts`, same seeded-deterministic canvas pipeline:
resolution 128 to 256; wood gains per-plank value offsets and seam AO
(8 to 12 percent darkening near seams); stone gains per-brick jitter,
seeded corner chips, mortar AO; metal gains brushed streaks and panel-edge
AO; base hues per the design palette (wood `#96682f`, stone field
`#6f747c`, metal `#67788a`). Update the node-side flat fallbacks in
`src/build/variants.ts` (`MATERIAL_COLOR`) to the same palette.

Test access path, named (review: Codex): the determinism hash reaches the
generated canvas through `material.map.image` (a `CanvasTexture`'s image IS
the source canvas); no new export needed, and the spec documents this.

Acceptance criteria:
- Determinism: same seed produces an identical canvas hash across two
  generations in the same browser run (Playwright, via
  `material.map.image.toDataURL()`).
- Wood / stone / metal remain pairwise distinct (evidence review).
- Draw calls and pool count unchanged.

Tests: hash Playwright; evidence `after-materials.png`.

### T33: Sky v2: three-stop gradient and clouds (Fable 5)

In `src/world/sky.ts` GLSL: three-stop gradient (zenith `#3579c8`, mid,
horizon `#d4f0f6` from the shared palette module); a horizon-band cumulus
layer from 4-octave domain-warped 2D value noise, sun-tinted, fully
deterministic (no time uniform); sun disc sharpened. `World` retains the
sky material handle and `debug.world.sky()` exposes its uniforms (same
ownership pattern as T31).

CI-budget gate (review decision 5A): the reference environment renders on
CPU (swiftshader), so per-pixel octaves may be expensive there. Acceptance
includes measuring the verify-suite wall time before and after; if the
delta breaches the sub-5-minute budget, the named fallback IS this ticket's
scope: bake the noise into a small procedural `CanvasTexture` at boot
(lookup instead of per-pixel octaves), still zero asset files.

Acceptance criteria:
- Same single sky mesh, same draw-call count.
- Uniform values asserted through `debug.world.sky()`.
- Deterministic frame: two screenshots of the same pumped state within the
  same run compare byte-identical; if PNG encoding proves unstable, the
  fallback assert is a pixel readback compare of a fixed clip (review:
  Codex; the intent is same-run determinism, not cross-run bytes).
- Verify-suite wall time within budget, measured and recorded in the
  ticket log; fallback executed if breached.

Tests: probe and determinism Playwright; evidence `after-sky.png`.

### T34: Material-tinted ghost (Fable 5)

In `src/build/ghost.ts`: valid ghost blends 35 percent toward the selected
material's base color; invalid stays pure red `0xff3b30`. `show()` gains a
material parameter fed by the build controller. Blend chosen so the blue
channel still dominates for valid wood (the existing verify-suite dominance
assertion survives). Sequenced after T32 so the blend targets the final
palette hues.

Acceptance criteria:
- `debug.target.ghostColorHex()` asserts the exact blended hex per
  material (three-way Vitest on the blend math plus Playwright probe).
- Verify-suite ghost test green without weakening.
- Ghost opacity and renderOrder unchanged.

Tests: as above. Evidence: `after-ghost-materials.png`.

### T35: HUD chrome pass (Fable 5, consumes T26)

In `src/style.css` and `src/hud/hud.ts`: the CSS-only display treatment on
the mode chip and tray key labels (system stack, weight 800, tightened
letter-spacing, condensed stretch where supported, 6 to 8 degree skew on
the chip); the T29 stamina bar inherits it. Minimap corner: move top-right
to top-left ONLY if T26 confirmed top-left; otherwise document staying put.
Crosshair, tray geometry, Fort's original inline SVG icons, and the teal /
copper identity accents unchanged.

Original-asset approach: CSS only; no font file enters the repo.

Acceptance criteria:
- Existing HUD spec green (elements, data attributes, tray count, active
  states unchanged).
- Bind labels still render live from the action map.
- If the minimap moves: the minimap spec's clip logic follows the element,
  not a hardcoded corner.

Tests: existing HUD and minimap specs; evidence `after-hud.png` at 1080p.

### T36: After-evidence set and verify suite refresh (Opus 4.8)

The Run B bookend, mirroring T21: produce the complete after-image set,
one per Phase 0 before-composition, enumerated (review: Codex; no pair may
silently drop):

| Before | After |
|---|---|
| before-third-person-idle.png | after-third-person-idle.png |
| before-player-proportions.png | after-proportions.png (T23) |
| before-grid-open-ground.png | after-grid-open-ground.png |
| before-stair-run.png | after-stair-run.png |
| before-fort-structure.png | after-fort-structure.png (T24) |
| before-island-wide.png | after-lighting-wide.png (T31) |
| t21 canonical set | re-run at final state |

Plus the per-ticket evidence named above (turbo run, jump vs wall, stamina
HUD, materials, sky, ghosts, HUD). Any pair not produced by an earlier
ticket is captured here by re-running `tests/before-evidence.spec.ts`
compositions at the final state with an after- prefix.

Also: extend `tests/verify.spec.ts` with the two highest-value new
assertions (turbo cadence count, proportion ratios); update `TICKETS.md`
with T22 to T36 outcomes; list the pairs in a short evidence table appended
to `docs/audit.md` or `docs/parity-evidence.md`.

Acceptance criteria:
- `npm run test:verify` green and under five minutes in the reference
  environment.
- Every before-composition has its after-image per the table.
- `npm run check` and `npm run test:unit` green; full `npm run test` green
  once, recorded in the ticket log.
- All fifteen tickets (T22 to T36) accounted for in `TICKETS.md`.

## What already exists (reused, not rebuilt)

- The `window.__fort.debug` surface carries every new assertion; only two
  probe groups are added (`world.lighting/sky`, `player.stamina`).
- The InstancedMesh pool, spatial hash, effects ring buffer, action map,
  and persistence schema are consumed unchanged.
- `tests/before-evidence.spec.ts` compositions are re-run for after-images
  rather than writing new scenes.
- The existing arc, movement, edit, HUD, and minimap specs are the
  regression net; tickets extend rather than replace them.

## NOT in scope (considered and deferred, with rationale)

- Harvest economy and pickaxe weak-point: Fort is unlimited-materials by
  design; matches Fortnite Creative posture (design M8).
- Character reskin or proportions: locked original by the brief.
- Outline/toon pass: neither game uses one.
- Post-processing beyond tone mapping (bloom, SSAO): swiftshader cost and
  determinism risk outweigh the read (design V6).
- Persistence schema bump: nothing in Run B adds a setting; conditional
  path documented in T29.
- Edit floor-grid change: only if T26 confirms 3x3; scoped as its own
  future coupled-pair ticket, never inside T26.

## Follow-ups (recorded per review; not Run B tickets)

- Edit tile-count literal dedup: `src/edit/edit-grid.ts` and
  `src/edit/variants-catalog.ts` independently restate the 3x3 / 2x2 tile
  counts and mask widths; they work because they agree. If T26 ever forces
  a grid-count change, extract a shared constant pair FIRST, then change
  it once. Until then this is documented debt (review decision D11).
- macOS verify-suite webServer fix (IPv4 vs IPv6 bind): spun off as a
  background task chip at review time (review decision D10); lands
  independently of Run B.
- Stamina-off gameplay toggle: only if the T29 feel gate requests it;
  requires CURRENT_VERSION 3 plus coercion extension.

## Failure modes (per new codepath: production failure, test, handling)

- Turbo cooldown race (destroy and place same sim step): covered by the
  t+0 negative test; rejection is visible (red ghost). No silent path.
- Stale cooldown entries after mass destruction: purge-on-insert bounds
  the map (4A); bound asserted in test.
- Maturation entry surviving destroy: cleared-on-remove asserted; without
  it a ghost schedule could resurrect HP writes (covered).
- Frame-rate-dependent hardening: eliminated by design (tick in
  fixedUpdate, 3A); pause assert proves it.
- Stamina drain during ineligible states: edge asserts (crouch, airborne)
  prevent silent drain; HUD bar makes state visible.
- Rescale stale literal: T22 pins plus the sweep; residual risk is a
  literal in a test nobody swept, which the full-suite gate catches.
- Sky shader on CI: wall-time budget assert with named fallback (5A).

No codepath lands with neither a test nor handling; zero critical gaps.

## Review-driven implementation tasks (all folded into this revision)

- R1 (P1) T23/T25/T27/T30: acceptance criteria corrected (stair collider
  scope, from-rest displacement, time-source design, tick API).
- R2 (P1) T24: ROOF_LAYERS 4 boundary fix.
- R3 (P2) T22: BUCKET export note, import wording, storey-bias keep.
- R4 (P2) T26 moved before the feel retunes; timebox and fallback added.
- R5 (P2) T29: drain semantics, HudSources contract, premise note.
- R6 (P2) T30: edit-x-maturation defined; pause assert added.
- R7 (P3) T32/T33/T36: canvas access path, same-run compare scope,
  after-pair enumeration; "fifteen tickets" wording fixed.

## Definition of done for Run B (carried from the brief)

All fifteen tickets landed in order with their gates honored; mechanics
before visuals in landing order throughout; `npm run check`,
`npm run test:unit`, and `npm run test:verify` green at head; the
before/after evidence pairs exist per the T36 table; no Epic asset in the
repo; the hero unchanged; the persistence schema unchanged (or bumped with
migration if and only if a gate added a setting).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | n/a |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | CLEAR (via plan-eng-review outside voice) | 22 findings, 20 folded, 2 resolved by decision |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 10 issues (3 arch, 0 quality, 5 test gaps, 2 perf), all resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | n/a |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | n/a |

- CODEX: outside voice ran via plan-eng-review; 22 findings, 20 folded as
  amendments (R1 to R7), 2 raised as cross-model tension and resolved by
  user decision (D8 reorder accepted, D9 stamina kept with gate authority).
- CROSS-MODEL: both reviewers agreed on the turbo-test fresh-slot gap and
  the measure-before-tune weakness; the reorder resolves both.
- VERDICT: ENG CLEARED (plan) - ready to present for implementation
  approval.

NO UNRESOLVED DECISIONS
