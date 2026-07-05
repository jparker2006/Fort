# Fort Phase 3 Design: Parity Changes That Fit the Architecture

Status: Phase 3 of the Fortnite parity brief (`docs/fortnite-parity-brief.md`).
This proposes concrete changes that close the gaps ranked in
`docs/gap-analysis.md`, in that order: mechanics first, visuals second. Every
change names the systems and files it touches, every visual change spells out
its original-asset approach, and every change carries a headless test plus an
evidence screenshot. Nothing here is code; this document is the proposal a
human approves before Phase 4 turns it into tickets.

The memorable thing this design serves, from the brief: a player who knows
Fortnite picks up Fort and their hands already know it. Building feels
identical first; the world looks right second.

## Part 0: Hard rules every change below obeys

Restated from the brief so the implementing session cannot miss them:

1. Headless testability. Every mechanic is proven through
   `game.stepForTest()` / `window.__fort.debug.pump(frames)` and asserted on
   deterministic state or the perf proxies (`debug.build.drawCalls()`,
   `debug.build.colliderCount()`, `debug.perf.nearComparisons()`,
   `debug.perf.poolGrows()`). Never wall-clock fps; the reference environment
   renders through swiftshader.
2. Action map only. No change below adds a hardcoded key. The one new
   behavior that reads input (sprint stamina) uses the existing `sprint`
   action. No new actions are proposed, so `src/input/defaults.ts` and the
   persistence schema are untouched.
3. `src/world/grid.ts` stays the single source of truth. The scale proposal
   (M1) changes values inside grid.ts and nowhere else; three constants that
   today restate grid-derived sizes as literals are converted to imports so
   they ride along (see M1 and Part 3).
4. InstancedMesh pooling stays. No per-piece meshes; visual changes touch
   materials and geometry factories, not the pooling model.
5. Original assets only. Every visual change below is procedural canvas,
   code-built geometry, GLSL, or DOM/CSS authored in this repo. No Epic
   texture, model, audio, font, or icon. The hero stays the blank / original
   skin defined in `src/character/` (`src/character/DESIGN.md` is the record).
6. No em dashes anywhere, including the docs and comments these changes add.
   `npm run check` gates it.

Sources cited as [E1], [F1] etc. refer to the ledger in `docs/research.md`.
Gap numbers (G1..G17) refer to `docs/gap-analysis.md`.

## Part 1: Mechanics changes (sequenced first, per locked decision 1)

### M1. Rescale the build lattice 1.2x: the proportion fix (G1, G3-partial)

The single most valuable change in this document, and the one that needs the
most deliberate human approval.

The numbers. Fortnite: wall 3.84 m, cell 5.12 m, player 1.92 m, so
wall:player = 2.00 and cell:player = 2.67 [E1, E3, high confidence]. Fort:
wall 3.0, cell 4.0, player 1.8, so 1.67 and 2.22. Scale Fort's grid by exactly
1.2 and leave the player alone:

- `CELL_SIZE` 4.0 becomes 4.8. Cell:player = 4.8 / 1.8 = 2.67. Exact.
- `CELL_HEIGHT` 3.0 becomes 3.6. Wall:player = 3.6 / 1.8 = 2.00. Exact.
- The 4:3 footprint-to-height ratio is preserved (4.8 : 3.6).

One pair of constants reproduces both Fortnite proportions exactly, the hero
mesh, skeleton, camera, and animation stack stay untouched, and the audit
verified that no file hardcodes 4 or 3 for cell dimensions, so the change
flows through imports. The alternative (shrink the player to 1.5) also lands
the ratios but forces a hero rescale, camera retune, and animation review,
and it leaves the traversal gap (G3) fully open. Rejected; recorded here so
Phase 4 does not relitigate it silently.

Derived consequences, each handled inside this change:

- Island grows from 160 to 192 units per side (`ISLAND_SIZE` derives).
  Fog, water ring, shadow frustum, and minimap scale all derive from grid.ts
  or `ISLAND_HALF` already (audit confirmed) and ride along. The 2048 shadow
  map covers a 20 percent wider frustum; acceptable texel loss, note in
  evidence.
- Stair treads: `STAIR_STEPS` 6 over a 3.6 wall gives 0.6 treads, exactly
  equal to `MOVE.stepHeight` 0.6. Equality sits on the step-up boundary
  (`rise <= stepHeight` in `src/player/movement.ts`), one float wobble from
  breaking stair walking. Bump `STAIR_STEPS` to 7 (tread 0.514, margin
  restored; geometry and colliders share the constant so both change
  together).
- Roof height: research says the cone peaks at about half a wall, not a full
  wall [F1, medium; the full-height claim was refuted in verification]. Fort's
  roof is currently a full `CELL_HEIGHT` cone. Change `roofGeometry()` to a
  `CELL_HEIGHT / 2` peak and rebuild `roofColliders` to match. This is
  gameplay-relevant (cover height, silhouette) so it belongs in mechanics.
- Reach constants stop being literals. `BUILD_REACH` 12 is 3 cells of the old
  grid; `EDIT_REACH` 9 and `MATTOCK_REACH` 9 are 2.25 cells. Convert them to
  grid-derived expressions (`3 * CELL_SIZE`, `2.25 * CELL_SIZE`) so reach
  stays cell-relative now and under any future rescale. Same for the
  collision spatial hash `BUCKET` 8, documented as "2 build cells": derive it
  as `2 * CELL_SIZE`.

Architecture fit: `src/world/grid.ts` (the two constants),
`src/build/colliders.ts` (`STAIR_STEPS`), `src/build/variants.ts`
(`roofGeometry`), `src/build/targeting.ts` (`BUILD_REACH` derivation),
`src/edit/edit-controller.ts` (`EDIT_REACH`),
`src/build/destroy-controller.ts` (`MATTOCK_REACH`),
`src/player/collision.ts` (`BUCKET`). Everything else consumes grid.ts.

Test and evidence plan:

- Vitest: grid helper round-trips at the new scale (`src/world/grid.test.ts`
  extended); collider dimensions for all four pieces at 4.8 / 3.6; stair
  tread height less than `MOVE.stepHeight` minus a margin (a regression trap
  for the boundary bug this change dodges); roof collider peak equals
  `CELL_HEIGHT / 2` within epsilon.
- Playwright through `debug`: place wall, floor, stairs, roof; walk a stair
  run to the top (`teleport`, hold `moveForward` via synthetic key, `pump`,
  assert `playerPos().y` climbs to 3.6); wall blocks horizontal movement;
  build, edit, destroy flow still green (`tests/verify.spec.ts` must pass
  unmodified except coordinate literals).
- Evidence: re-shoot `before-player-proportions.png` composition as
  `after-proportions.png`; the hero should now read half a wall tall. Side by
  side with the Phase 0 image, this is the money shot of the whole effort.

### M2. Turbo build at Fortnite cadence (G2, G10)

Fortnite classic turbo: first piece about 0.15 s after the hold starts, then
one piece per 0.05 s, with about a 0.15 s cooldown before re-placing into a
spot where a piece just died [F1, D1, medium confidence]. Fort: flat 0.1 s
interval, no first-piece delay, no same-spot cooldown.

Proposal: `TURBO_INTERVAL` 0.1 becomes 0.05. Add `TURBO_FIRST_DELAY` 0.15
(applies between the initial tap-place and the first turbo repeat, so a
single click still places instantly, which is how Fortnite reads) and
`REPLACE_COOLDOWN` 0.15 tracked per slot key on destroy in
`src/build/build-model.ts` (a small `recentlyFreed` map, cleared by
timestamp; the build controller consults it in `placeTarget`).

Pool check: a 100-piece rush at 20 per second is 5 seconds of hold;
`INITIAL_CAPACITY` 256 still swallows it without a grow. Assert via
`debug.perf.poolGrows()` staying 0 in the test.

Architecture fit: `src/build/build-controller.ts` (cadence),
`src/build/build-model.ts` (freed-slot timestamps), no input changes (the
`primaryFire` hold already drives it), gameplay toggle `turboBuild` keeps
gating the whole behavior.

Test and evidence plan:

- Vitest: cadence math on the controller timer (pure logic extract if
  needed).
- Playwright: hold synthetic primary fire, `pump` 120 frames (2 s), assert
  `debug.build.count()` lands within one piece of 2 / 0.05 = 40 minus the
  first-delay allowance; destroy a piece, immediately attempt same-slot
  place, assert rejected, `pump` past 0.15 s, assert accepted;
  `debug.perf.poolGrows()` equals 0 after a 100-piece row.
- Evidence: `after-turbo-run.png`, a ramp rush frozen mid-run showing a
  staircase of fresh pieces.

### M3. Traversal speed tuned to the new grid (G3, feel-gated)

With the 4.8 cell, crossing one cell at Fort's current 5.5 u/s takes 0.87 s
versus Fortnite's about 1.02 s (500 uu/s over 5.12 m [community, low
confidence]). Close the rest by retuning:

- `runSpeed` 5.5 becomes 4.7 (4.8 / 4.7 = 1.02 s per cell, matching the
  estimate exactly).
- `sprintSpeed` 6.6 becomes 6.0 (crosses a cell in 0.8 s; sprint:run ratio
  1.28, inside the 25 to 30 percent community band).
- `crouchSpeed` 2.8 becomes 2.4 (preserves Fort's 0.51 crouch:run ratio,
  which already sits inside the Fortnite estimate band).
- `airMaxSpeed` follows sprint to 6.0.

Because the Fortnite numbers are low confidence, this ships as a feel-gated
checkpoint: the implementing session presents the retuned build alongside the
old values and a human approves by hand-feel before the ticket closes. The
brief's measure-first caveat lives here.

Architecture fit: `src/player/movement-tuning.ts` only. The animation
controller's cadence scaling reads live speed, but its reference constants
(`RUN_REFERENCE_SPEED` 3.24, `SPRINT_REFERENCE_SPEED` 4.85, the 6.0 sprint
threshold in `animation-controller.ts`) were calibrated against the old
speeds; retune the threshold below the new sprint speed (5.3) and re-measure
the reference speeds with the existing animation test.

Test and evidence plan:

- Vitest: cell-crossing time equals cell / runSpeed within epsilon
  (documenting test that fails loudly if either side retunes alone);
  animation state picks sprint at the new sprint speed.
- Playwright: teleport, hold forward, pump exactly 1.02 s of frames, assert
  displacement is one `CELL_SIZE` within tolerance.
- Evidence: none visual beyond the existing movement spec; the feel gate is
  the human checkpoint.

### M4. Jump arc scaled to the wall (G4, feel-gated)

Fortnite jumps reach roughly a quarter of a wall (apex about 0.9 to 1.0 m
against 3.84) [derived, low confidence]. Fort's apex is 1.5 against a 3.0
wall: half a wall, and after M1 still 42 percent of the new 3.6 wall. A single
wall should be real cover.

Proposal: target apex 0.9 units. Keep `riseGravity` 15.41 (Fort's rise feel
is liked and Fortnite's split is unpublished, G7 stays a measure-first hold),
so `jumpSpeed` = sqrt(2 x 15.41 x 0.9) = 5.27. Update `jumpApexTarget` to
0.9 so the existing analytic arc test follows. Apex:wall becomes 0.9 / 3.6 =
25 percent, on the estimate.

Feel-gated the same way as M3, and explicitly revisitable: if hands say
Fortnite jumps feel higher than the estimate, the checkpoint adjusts the
target, not the test.

Architecture fit: `src/player/movement-tuning.ts` (`jumpSpeed`,
`jumpApexTarget`). `jumpApex()` and `jumpAirtime()` derive. The jump clip
timing (0.9 s) in `src/character/clips.ts` should be checked against the new
airtime (about 0.61 s analytic) and shortened if the pose visibly lags the
landing.

Test and evidence plan:

- Vitest: existing arc test asserts apex within tolerance of
  `jumpApexTarget` (already wired to the constant, so it follows).
- Playwright: jump next to a wall, assert the player cannot mount a full
  wall from flat ground with a bare jump anymore (regression trap for the
  cover promise).
- Evidence: `after-jump-vs-wall.png`, apex frame beside a wall.

### M5. Sprint stamina and sprint-jump (G5)

Fortnite behavior, well sourced: sprint is stamina-limited (bar drains, then
back to jog until it refills) and jumping while sprinting jumps higher [E4
behavior high confidence, numbers unpublished].

Proposal, all constants in `MOVE`:

- `staminaMax` 6.0 s of sprint, `staminaRegen` 2x drain rate (empty to full
  in 3 s), regen only while not sprinting.
- Sprint is blocked at zero stamina until it recovers above a 15 percent
  re-engage threshold (prevents flutter at empty).
- Sprint-jump: while sprinting, `jumpSpeed` multiplied by 1.10 (apex about
  1.09; still under a third of a wall).
- HUD: a slim stamina bar that renders only while stamina is not full,
  DOM/CSS in `src/hud/hud.ts` next to the existing rows, styled with the
  existing HUD custom properties. Original art: a plain CSS bar, no icon.

No new action (reads the existing `sprint` hold), no new setting, no
persistence change. If a later decision wants a "stamina off" toggle, that is
a `GameplaySettings` field and a schema version bump; deliberately NOT
proposed, see Part 3.

Architecture fit: `src/player/movement-tuning.ts`,
`src/player/movement.ts` (drain, gate, jump multiplier),
`src/player/player-state.ts` (stamina field), `src/hud/hud.ts` (bar).

Test and evidence plan:

- Vitest: drain 6 s of sim, assert sprint target speed falls back to run;
  regen 3 s, assert sprint re-engages; sprint-jump apex = base apex x 1.21
  (velocity multiplier squared).
- Playwright: hold sprint through `debug.pump`, read a new
  `debug.player.stamina()` probe, assert the HUD bar element appears and
  drains.
- Evidence: `after-stamina-hud.png` mid-drain.

### M6. Material HP retune plus maturation (G6, G9)

Two gaps, one mechanism. Fortnite full HP ratio wood:brick:metal is about
150:300:400, pieces spawn at roughly half HP and harden over a few seconds
[M1 medium], and the pickaxe kills fresh wood in 2 swings [G1-era anchor].

The integer trick: at 75 damage per swing, Fortnite full pieces die in 2 / 4
/ 5.33 swings. Fort already counts HP in Mattock swings. Set `MATERIAL_HP`
wood 2, stone 4, metal 6 (ratio 1:2:3, versus Fortnite's 1:2:2.67; metal
rounds up because HP is integer and metal should stay the premium material).
Maturation: pieces place at `ceil(half)` (wood 1, stone 2, metal 3) and gain
1 HP per second until full (wood full at 1 s, stone 2 s, metal 3 s), tracked
by a `maturesAt` schedule ticked in `BuildSystem.update`. A freshly placed
wood wall dies to one swing; a hardened one takes two. That is the Fortnite
tempo in Fort's own units.

Edits keep current HP (Fortnite re-forms on edit; simplification: no HP
change on edit, noted as a deliberate difference unless the feel checkpoint
objects).

Architecture fit: `src/build/build-model.ts` (`MATERIAL_HP`, spawn HP,
maturation tick, `hpAt` already exposed), `src/build/build-system.ts` (tick
wiring). HUD shows nothing new (Fort has no piece health bar; matches
Fortnite, which shows HP only when damaged; a damage-flash on the piece is
covered by the existing effects).

Test and evidence plan:

- Vitest: place wood, `hpAt` = 1; advance 1 s, = 2; stone and metal ladders
  likewise; damage a fresh piece for the one-swing kill.
- Playwright: Mattock a fresh wall (1 swing dies), a matured wall (2
  swings), assert via `debug.build.count()` and `hpAt`.
- Evidence: none visual; the numbers are the story.

### M7. Edit-grid verification pass (G8, verify-first, likely no change)

Wall 3x3 already matches [F1 medium]. The floor / ramp / cone tile counts
are low confidence in research (one source claims floors are 3x3; common
understanding and Fort's implementation say 2x2). Proposal: a verification
task, not a code change. The implementing session observes the real game
(or a current authoritative source), records the answer in
`docs/research.md`, and only if floors are truly 3x3 does a follow-up ticket
get scoped (it would touch `src/edit/edit-grid.ts` tile counts and the mask
widths in `src/edit/variants-catalog.ts` together, a coupled pair the audit
flagged). No speculative rework of a system that already matches on the
strongest-sourced piece.

Test and evidence plan: none until verification lands; the existing edit
specs already lock current behavior.

### M8. Out of scope, stated so Phase 4 does not drift (G11)

Harvest economy (material counts, farming) stays out: Fort is a creative
freebuild sandbox with unlimited materials by design, matching Fortnite
Creative's effectively unlimited resources, and the HUD's infinity glyph is
honest. The pickaxe weak-point minigame is cut with it (it exists to speed
farming, which Fort does not have). If a future mode wants an economy, it is
its own brief. No ticket.

## Part 2: Visual direction and changes (sequenced after all mechanics)

### The direction in one package

Aesthetic: readable stylized, exactly the register Fort already lives in,
pushed toward Fortnite's brightness and material clarity. High-key daytime,
saturated but not neon, forms readable at a glance from build height, zero
outlines (matching both games: silhouettes come from shape and value
contrast, not ink). Decoration level: intentional; the surfaces carry
hand-crafted variation, the HUD stays flat and functional.

Palette (all original values, chosen by intent, no Epic color sampled):

- Grass: base `#4a8f3c`, speckle range pushed warmer and 10 percent more
  saturated than today's `#3f7a3a` family. Spring green, not forest.
- Sky: zenith `#3579c8` (a touch lighter and warmer than today's
  `#2f6fb0`), horizon `#d4f0f6`, sun tint `#ffe9b8` (warmer than today's
  `#fff2cc`).
- Fog: matches the new horizon `#d4f0f6`, and the sky/fog/sun trio is
  consolidated into one shared module so the three files that today restate
  matching hex literals (audit flag) cannot drift.
- Materials: wood toward honeyed tan (`#96682f` base), stone toward warm
  gray (`#6f747c` mortar field), metal toward cool steel with brushed
  variation (`#67788a` base). HUD keeps Fort's teal `#33c4c4` and copper
  `#cf7d3c` identity; that stays Fort's own face, deliberately.

Type: no font files enter the repo (rule 5; even open-license files fail the
authored-in-repo bar). The HUD's mode chip and labels get a heavier,
tightened, slightly italic treatment built purely in CSS (system stack,
`font-weight` 800, `letter-spacing`, `font-stretch condensed` where
supported, 6 to 8 degree skew on the chip). Reads punchy and game-like,
costs zero assets.

Coherence: one lighting rig, one palette module, and one material language
mean every surface change reinforces the same bright readable register; the
HUD accents stay Fort's, so parity work never blurs into imitation.

Safe choices (category baseline, kept deliberately): blue-valid /
red-invalid ghost language; four-slot tray order wall, floor, stairs, roof;
no outline pass; center crosshair with per-mode variants.

Risks (where this design spends its boldness):

1. The 1.2x grid rescale (M1). Mechanical, but it is also the biggest visual
   change in the document: every screenshot after it reads different. What
   it buys: exact Fortnite proportions. What it costs: every coordinate
   literal in tests, and a full feel re-check.
2. ACES tone mapping plus the lighting retune (V1) changes the whole game's
   look in one move rather than nudging per-surface. Buys: instant depth
   and warmth. Costs: every existing evidence screenshot goes stale at once
   (they are regenerated by the same specs, so the cost is review time).
3. CSS-only display treatment for HUD chrome. Buys: game-feel typography
   with zero asset risk. Costs: less control than a real display font; if it
   reads cheap at review, the fallback is simply reverting the CSS block.

### V1. Lighting and grade: the bounce-light pass (G12, G17)

Fortnite Chapter 4+ runs real dynamic GI [E5, high]; Fort has a sun, a
hemisphere, and nothing filling the shade. Vanilla Three.js gets no Lumen,
so approximate the read, not the tech:

- Renderer: `ACESFilmicToneMapping`, `toneMappingExposure` 1.15 (today:
  default, no tone mapping). One line in `src/core/game.ts`, the single
  biggest look win available.
- Hemisphere light 0.9 to 1.25 intensity, ground color from `#3a5233`
  toward `#4a6b3a` (grass-bounce green), sky tint per the palette.
- Sun 2.1 to 1.8 intensity (ACES lifts mids; the sun no longer needs to
  overdrive), warmer color per palette.
- Procedural ambient occlusion baked into the build-material textures:
  darken 8 to 12 percent within a few pixels of plank seams, brick mortar
  lines, and panel edges during canvas generation. Fakes contact shading
  with zero runtime cost and zero new assets.

Original-asset approach: all light values and canvas AO are code in
`src/world/island.ts`, `src/core/game.ts`, and `src/build/materials.ts`. No
image enters the repo.

Test and evidence plan:

- Headless: a new `debug.world.lighting()` probe returning tone mapping
  mode, exposure, and per-light intensities; Playwright asserts exact
  values (deterministic, no pixel reads). Draw calls unchanged
  (`debug.build.drawCalls()`), proving no extra passes snuck in.
- Evidence: re-shoot `before-island-wide.png` and `before-materials`
  compositions as `after-lighting-wide.png` / `after-materials.png`. The
  before/after pair is the review artifact.

### V2. Material texture richness (G13)

Wood, stone, metal at 128 px read flat up close. Proposal, all in
`src/build/materials.ts` canvas code, same seeded-deterministic pipeline
(screenshot stability is a hard requirement of the test suite):

- Resolution 128 to 256.
- Wood: per-plank value offsets (plank boundaries every 1/4 of the tile
  width), knots kept, plus the V1 edge AO.
- Stone: per-brick value jitter widened, corner chips (2 to 3 px triangles
  knocked off random brick corners, seeded), mortar AO.
- Metal: brushed streaks (low-alpha horizontal strokes), panel-edge AO,
  rivets kept.
- The node-side flat fallbacks in `src/build/variants.ts` update their base
  colors to the new palette so browser and test renders stay visually
  consistent (audit flagged this pairing).

Original-asset approach: procedural canvas only, seeds fixed, zero files.

Test and evidence plan: unit-testable determinism (same seed, same pixel
checksum via canvas `toDataURL` hash in a browser spec); evidence
`after-materials.png` beside the Phase 0 shot; draw calls and pool count
unchanged.

### V3. Sky with weather in it (G14)

Today: two-stop gradient plus a two-lobe sun glow. Proposal, all in the
`src/world/sky.ts` GLSL:

- Three-stop gradient (zenith, mid, horizon) with the palette colors.
- A low band of procedural cumulus using 2D value noise in the fragment
  shader (4 octaves, domain-warped, clamped to a horizon band), tinted by
  sun direction. No textures, no sprites, pure shader math, deterministic.
- Sun disc sharpened slightly (the 512-power lobe gains a hard core).

Original-asset approach: GLSL authored in-repo; no cubemap, no image.

Test and evidence plan: headless probe for uniform values; evidence
`after-sky.png` from the island-wide composition; frame cost checked by
draw-call count (unchanged: same single sky mesh).

### V4. Material-tinted ghost (G15)

Keep the validity color language exactly (blue `0x2f7fff` valid, red
`0xff3b30` invalid, Fort's own hexes). Change: when valid, the ghost tints
toward the selected material's base color at 35 percent blend so a wood
ghost reads warm, metal reads cool, matching the "preview of the actual
piece" read [F1]. Invalid stays pure red for unambiguous denial.

Architecture fit: `src/build/ghost.ts` material handling; reads the
controller's current material through the existing `show()` call path (one
new parameter).

Test and evidence plan: `debug.target.ghostColorHex()` asserts the blended
hex per material; the verify-spec ghost test keeps its blue/red dominance
checks (blend chosen so blue channel still dominates for valid wood, the
existing assertion survives). Evidence: `after-ghost-materials.png`, three
ghosts over three materials.

### V5. HUD chrome pass (G16 plus the type treatment)

- Minimap corner: research puts Fortnite's minimap top-left at low-medium
  confidence; Fort sits top-right. Cheap either way (CSS block in
  `src/style.css`). Proposal: verify during implementation (same
  observation task as M7) and move only if confirmed; placement familiarity
  is not worth a wrong guess.
- Type treatment per the direction package: mode chip and tray key labels
  get the CSS-only heavy condensed treatment; crosshair, tray geometry, and
  icons stay as-is (they already match the hierarchy).
- Stamina bar from M5 inherits this styling.

Original-asset approach: CSS only, existing custom properties, no font
files, icons remain Fort's original inline SVGs.

Test and evidence plan: existing HUD spec asserts elements and data
attributes (unchanged); evidence `after-hud.png` at 1080p beside
`t21-hud-build.png`.

### V6. Deliberately not proposed

- Character reskin or proportion change: the hero is locked original by the
  brief; proportions were verified in range (audit records 1.8 with correct
  camera pivot).
- Outline or toon pass: neither game uses one.
- Post-processing beyond tone mapping (bloom, SSAO): swiftshader cost and
  determinism risk outweigh the read; the V1/V2 fakes carry the look.

## Part 3: HIGH BLAST RADIUS (read this section before approving anything)

### grid.ts scale change (M1). This is the loud flag the brief demands.

`src/world/grid.ts` is the single source of truth, and M1 changes its two
core constants. Blast radius, enumerated:

- Flows automatically through imports (verified by the Phase 0 audit):
  slots and placement, colliders, variants geometry, targeting math, edit
  face frames and variant geometry, world ground/overlay/water/fog/hills,
  minimap scale, `clampToIsland` movement bounds.
- Needs explicit companion edits (literals that restate grid-derived
  sizes today): `BUILD_REACH` (targeting), `EDIT_REACH` (edit controller),
  `MATTOCK_REACH` (destroy controller), `BUCKET` (collision hash),
  `STAIR_STEPS` boundary vs `stepHeight` (M1 body). M1 converts all of
  these to grid-derived expressions, which permanently shrinks this
  section for future scale work.
- Breaks by coordinate: every Playwright spec that teleports to literal
  coordinates or asserts literal positions (`tests/*.spec.ts`, the verify
  suite, the Phase 0 evidence spec). Phase 4 must budget a test-sweep
  inside the M1 ticket, not as a follow-up.
- Movement interactions: traversal and jump gaps change meaning the moment
  the grid rescales; M3 and M4 are sequenced immediately after M1 for this
  reason and must not land before it.

Approval ask: a human says yes to 4.8 / 3.6 knowing the above, or the
fallback (player rescale to 1.5, larger character-stack risk, traversal gap
left open) gets chosen instead. No third option is proposed.

### Persistence schema (`src/input/persistence.ts`, CURRENT_VERSION 2)

This design proposes ZERO persistence changes: no new actions, no new
settings, no `GameplaySettings` fields. Every new tunable is a code
constant. Therefore no version bump and no migration are needed anywhere in
this plan. Two conditional flags so nobody trips later:

- If review of M5 asks for a "stamina off" toggle, that adds a
  `GameplaySettings` field, which changes the persisted shape: bump
  `CURRENT_VERSION` to 3 and extend `coerceGameplay` (the tolerant coercion
  makes the migration one line, but the bump is mandatory per the brief).
- If V5's minimap move ever becomes a user-facing position setting rather
  than a CSS constant, same rule.

## Part 4: Sequencing (mirrors the gap ranking; mechanics strictly first)

| Order | Change | Gaps | Gate |
|---|---|---|---|
| 1 | M1 grid rescale + roof height + derived constants | G1, G3-part | Human approves scale decision; full test sweep |
| 2 | M2 turbo cadence + cooldowns | G2, G10 | Headless cadence asserts |
| 3 | M3 traversal retune | G3 | Feel-gated human checkpoint |
| 4 | M4 jump arc | G4 | Feel-gated human checkpoint (batch with M3) |
| 5 | M5 sprint stamina + sprint-jump | G5 | Feel-gated; HUD element review |
| 6 | M6 material HP + maturation | G6, G9 | Headless HP ladder asserts |
| 7 | M7 edit-grid verification (task, not code) | G8 | Research note updated |
| 8 | V1 lighting + ACES grade | G12, G17 | Before/after evidence review |
| 9 | V2 material textures | G13 | Before/after evidence review |
| 10 | V3 sky | G14 | Before/after evidence review |
| 11 | V4 tinted ghost | G15 | Ghost hex asserts + evidence |
| 12 | V5 HUD chrome (+ minimap verify) | G16 | Evidence review |

M8 and V6 are explicit non-work. Every change keeps `npm run check` green
(typecheck, zero-warning lint, no em dash) and the verify suite green as its
exit criteria; feel-gated rows stop for a human even when tests pass.

## Deliverable status

- `docs/design.md` (this file): complete. Architecture fit named per change,
  original-asset approach per visual change, headless test plus evidence per
  change, high-blast-radius section for grid.ts and persistence, sequencing
  mechanics-first per the gap ranking.
- No code, no `src/` change, no asset added.
- Next phase (not started): Phase 4, the ticketed implementation plan
  (T22 onward), assembled in native plan mode on Opus 4.8 and presented for
  approval as the stop gate.
