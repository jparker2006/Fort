# Fort: Build Plan and Tickets

Fort is a single-player, desktop-only, Fortnite-style creative freebuild sandbox delivered as an installable fullscreen PWA. No combat, no economy, infinite materials. Build, edit, and movement mechanics plus HUD layout must match Fortnite Battle Royale creative freebuild behavior exactly, while every visual asset (character, skin, HUD art, textures, icons) is original work with no Epic Games assets, likenesses, or trade dress.

## Architecture Summary

**Stack: Vite + TypeScript + vanilla Three.js.** No deviation. Reasons this is the right fit: a single bespoke 3D scene with custom character control and a voxel-adjacent build grid gains nothing from React or a full engine; Three.js gives direct control over InstancedMesh batching needed for the 500+ piece 60fps bar; Vite gives fast dev iteration and a clean PWA build target.

Supporting choices:

- **Rendering**: one WebGL2 renderer, single scene. All build pieces render through per-variant `InstancedMesh` pools keyed by (piece variant, material). Placing or destroying a piece updates an instance matrix, never allocates a new draw call.
- **Physics/collision**: hand-rolled kinematic character controller (capsule vs. static world) rather than a physics engine. The world is a flat plane plus grid-aligned convex build pieces, so swept-capsule collision against an AABB/tri-plane set per occupied cell is simpler, deterministic, and tunable for Fortnite feel. No dynamics needed anywhere.
- **Build model**: a sparse spatial hash keyed by integer cell coordinates. Each cell owns slots: 4 wall edges, floor face, interior diagonal (stairs), top (roof/cone). A placed piece is data (slot, variant, material, edit state); meshes and colliders are derived views of that data. Edits mutate variant data and the derived views follow.
- **Grid scale**: cell footprint 4 x 4 units, cell height 3 units (matching Fortnite's 512:512:384 proportions, 1 unit is about 1 meter). All placement, editing, and movement tuning assumes this scale.
- **Input**: an action-map layer between raw DOM events and gameplay. Gameplay code reads named actions only; every physical bind is user-configurable data persisted to localStorage.
- **State/UI**: game state in plain TS modules with a small event bus. HUD and settings are DOM/CSS overlaid on the canvas (crisper text, easier original art, trivially testable with Playwright). Minimap is a 2D canvas.
- **Animation**: original character modeled and rigged procedurally in code (skinned mesh built from primitives-based body parts under a programmatic skeleton) with hand-authored keyframe clips via Three.js `AnimationMixer`. This guarantees originality and keeps the repo free of binary assets of uncertain provenance.
- **Persistence**: settings and binds persist to localStorage. Placed builds intentionally do NOT persist; reload gives a clean island.
- **PWA**: hand-written service worker (precache app shell on install, cache-first for hashed assets) rather than a plugin, to keep the offline story auditable.
- **Testing**: Playwright drives a real headed Chromium against the dev/preview server, takes screenshots of HUD, ghost preview, and edit grid states, and asserts on both DOM state and pixel evidence. A repo-wide lint step fails the build if an em dash appears in any source, comment, UI string, or doc.

## Repository Layout (target)

```
src/
  core/        engine loop, time, events, math
  input/       action map, bindings, pointer lock
  world/       island, grid visuals, skybox, scenery, lighting
  player/      movement controller, camera rig
  character/   model, skeleton, animation states
  build/       grid model, placement, targeting, materials, destroy
  edit/        edit grids, selection, variant catalog
  hud/         crosshair, tray, indicators, minimap
  settings/    settings model, persistence, menu UI
  pwa/         manifest wiring, service worker, fullscreen/pointer lifecycle
tests/         playwright specs and screenshot baselines
public/        icons, manifest
```

## Recommended Execution Plan

Tickets are ordered by dependency. Feel-gated means the batch ends with a stop for user approval because it touches movement physics, jump arc, camera feel, or character animation. Everything else runs autonomously in one loop, verified by its own acceptance criteria plus Playwright evidence.

| Batch | Tickets | Mode | Gate condition |
|-------|---------|------|----------------|
| 1. Foundation | T01, T02, T03, T04 | Autonomous | none |
| 2. Movement and camera | T05, T06 | FEEL-GATED | Stop: user must approve camera feel, accel, air control, and jump arc in a playable build before Batch 3 |
| 3. Character art | T07 | Autonomous | none (static model and skin only, no animation) |
| 4. Character animation | T08 | FEEL-GATED | Stop: user must approve all animation states and build-swing feel |
| 5. Building | T09, T10, T11, T12 | Autonomous | none |
| 6. Editing | T13, T14 | Autonomous | none |
| 7. HUD and settings | T15, T16, T17 | Autonomous | none |
| 8. App shell | T18, T19 | Autonomous | none |
| 9. Performance and verification | T20, T21 | Autonomous | final review |

Notes on batching:

- Batch 2 blocks everything player-facing, so it comes early; the approval loop on movement feel is the highest-risk part of the project and should get maximum iteration room.
- Batch 3 (model) is deliberately split from Batch 4 (animation) so the art can land autonomously and only the feel-sensitive animation pass needs a gate.
- Batches 5 and 6 depend on movement/camera being approved (targeting comes from the camera ray) but are themselves deterministic mechanics, not feel, so they run autonomously with Playwright evidence.
- T20 (performance) runs late so it optimizes the real final scene, but its instancing architecture is baked in from T09 so it is a verification and tuning ticket, not a rewrite.

---

## Tickets

### T01: Project scaffold and quality gates

**Dependencies**: none

**Description**: Initialize the Vite + TypeScript + Three.js project with strict TS config, the repository layout above, ESLint plus Prettier, and Playwright installed and configured to run against the Vite preview server using the system Chromium. Add a `check:no-emdash` script that scans every tracked text file (src, tests, docs, configs) for U+2014 and fails CI-style checks if found; wire it into the main `check` script alongside typecheck and lint. Add npm scripts: `dev`, `build`, `preview`, `check`, `test`.

**Acceptance criteria**:
- `npm run dev` serves a page with a WebGL canvas and no console errors.
- `npm run check` runs typecheck, lint, and the em dash scan; introducing an em dash anywhere in the repo makes it fail.
- `npm run test` executes a trivial Playwright spec that loads the page in real Chromium and screenshots the canvas.
- README stub documents scripts and the no-em-dash rule.

**Verification note**: Done. Vite + TS + Three.js scaffold with strict tsconfig, ESLint (0 warnings), Prettier, Vitest, and Playwright configured against the environment Chromium at `/opt/pw-browsers/chromium-1194` (executablePath pinned because the installed @playwright/test expects build 1228). `npm run check` runs typecheck + lint + `scripts/check-no-emdash.mjs`; a self-test confirmed the scan fails on a planted U+2014 and reports `file:line:col`. `npm run build` produces a clean bundle. `npm run test` loads the app in real Chromium, asserts the `canvas.fort-canvas` is visible and larger than 100x100, captures zero console/page errors, and screenshots `test-results/evidence/t01-smoke.png` (teal cube renders under swiftshader, confirming WebGL2 works headless). README documents all scripts and the no-em-dash rule.

### T02: Core engine loop and scene lifecycle

**Dependencies**: T01

**Description**: Renderer setup (WebGL2, sRGB output, shadow map config), a fixed-timestep simulation loop (120 Hz sim, interpolated render) with an accumulator, a central `Game` object owning scene/systems, window resize handling, visibility-change pausing of the sim clock, and a debug FPS/frame-time readout toggleable with a key. Establish the small typed event bus used by later systems.

**Acceptance criteria**:
- Simulation updates at a fixed timestep independent of display refresh; a spinning debug cube renders smoothly at 60, 120, and 144 Hz displays (verified by decoupling test with artificial frame stalls).
- Resizing the window never distorts aspect or leaks canvases.
- Tabbing away and back does not produce a giant delta-time step.
- FPS readout displays and toggles.

**Verification note**: Done. `src/core/` holds the engine: a typed `EventBus`, a `FixedStepper` (120 Hz sim, accumulator, clamp to 8 steps), a `Game` object owning renderer/scene/camera/systems, and a `DebugOverlay`. The loop runs fixedUpdate per sim step, then update(frameDelta), then render(alpha) with interpolation. Vitest `time.test.ts` (7 tests) proves the decoupling under artificial stalls: matched-cadence gives 1 step, a 60 Hz frame gives 2 steps at 120 Hz sim, sub-step frames carry into alpha, a 2 s stall clamps to 8 steps (no spiral of death), and alpha stays in [0,1) across a random delta walk. Playwright `engine.spec.ts` (3 tests): backquote toggles the overlay and it shows fps/frame/sim/draws (screenshot `t02-overlay.png` shows fps 45 with sim running 2 steps per frame, confirming sim rate is independent of the software-rendered frame rate); resize keeps camera aspect matched to the canvas within 0.01 across three viewport shapes (no distortion); render frame counter advances over time. Giant-delta protection on tab-away is covered two ways: `visibilitychange` pauses the sim clock, and the stepper clamp bounds catch-up regardless.

### T03: Creative island world

**Dependencies**: T02

**Description**: Flat creative island: a large flat buildable ground plane (at least 40 x 40 build cells, so 160 x 160 units) with an original grass-like texture, a visible build grid overlay on the ground aligned exactly to the 4-unit cell lattice (subtle lines, Fortnite-creative-like readability), an original gradient/procedural skybox with sun, distant out-of-bounds scenery (low-poly hills/water ring) beyond the island edge, hemisphere plus directional lighting with soft shadows. Island bounds stop the player at the edge. All textures generated procedurally or hand-drawn in-repo; no third-party assets.

**Acceptance criteria**:
- Grid lines land exactly on cell boundaries used later by the build system (shared constant, single source of truth for cell size).
- Skybox, ground, and scenery show no seams or z-fighting; horizon looks intentional at default FOV.
- A Playwright screenshot of the empty island is captured as a visual baseline.
- No external asset files; everything original and generated in-repo.

**Verification note**: Done. `src/world/grid.ts` is the single source of truth (CELL_SIZE 4, CELL_HEIGHT 3, 40x40 island = 160x160 units centered on origin) with cell/world helpers; `grid.test.ts` (5 tests) verifies origin/center/inverse/bounds/clamp. `World` (`island.ts`) assembles a grass ground (procedural `makeGrassTexture`, no image files), a build-grid `LineSegments` overlay whose vertices are all exact multiples of CELL_SIZE, a procedural gradient sky dome with sun glow (`sky.ts`), a water ring, and distant instanced low-poly hills, plus hemisphere + shadow-casting directional light and blended fog. Playwright `world.spec.ts`: baseline screenshot `t03-island.png` (grid reads clearly, sky/ground/water/hills present, zero console errors) and a test asserting every grid vertex lands on the 4-unit lattice. All textures generated in-repo; no external asset files.

### T04: Input action map and rebindable bindings core

**Dependencies**: T02

**Description**: The action-map layer: define the full action list (moveForward/back/left/right, jump, sprint, crouch, buildWall, buildFloor, buildStairs, buildRoof, edit, resetEdit, rotate, materialCycle, destroyPickaxe, buildCombatToggle, primaryFire, settingsMenu), a default bind table (Fortnite-familiar defaults, but nothing hardcoded as final), runtime rebinding API, conflict detection (same physical key bound to two actions in the same context), serialization of binds to localStorage with versioned schema and migration-safe loading, and raw mouse delta capture under pointer lock with per-context sensitivity multipliers (look, targeting, build mode, edit mode) applied at this layer. No gameplay yet; a debug overlay shows live action states.

**Acceptance criteria**:
- All listed actions exist; gameplay-facing API exposes only actions, never key codes.
- Rebinding an action at runtime takes effect immediately and persists across reload.
- Conflict detection reports collisions; the API supports swap-or-reject resolution for the settings UI to use later.
- Sensitivity multipliers are separate values per context and applied to mouse deltas correctly (unit test with synthetic deltas).
- Debug overlay shows pressed/released action states for every bind.

**Verification note**: Done. `src/input/` holds the layer: `actions.ts` (all 19 actions with metadata), `defaults.ts` (Fortnite-familiar defaults, conflict-free), `bindings.ts` (`Bindings` with get/actionFor/rebind reject|swap|steal/conflicts/reset, plus `formatBindLabel`), `sensitivity.ts` (pure `scalePointerDelta` over four contexts with invert Y), `persistence.ts` (versioned localStorage with tolerant coercion and migration seam), and `InputSystem` which is the sole DOM bridge: gameplay reads `isDown`/`justPressed`/`justReleased` and `consumePointerDelta(context)` and never sees codes; per-frame edges are captured in handlers and cleared in `lateUpdate` (new engine hook) so consumers are order-independent. Unit tests: `sensitivity.test.ts` (6, synthetic deltas prove the four contexts are distinct and invert Y flips pitch only), `bindings.test.ts` (10, conflict/swap/steal/reset/labels), `persistence.test.ts` (6, round-trip, corrupt-JSON fallback, partial-payload coercion) - 33 unit tests total pass. Playwright `input.spec.ts` (4): keyboard drives action state live through the map, the overlay lists all actions and shows `[*]` while W is held (screenshot `t04-input-overlay.png`), a rebind of jump to KeyJ persists across reload, and a duplicate bind is rejected with the conflicting action reported.

### T05: Third-person over-the-shoulder camera rig (FEEL-GATED)

**Dependencies**: T03, T04

**Description**: Fortnite-style third-person camera: right-shoulder offset over-the-shoulder framing, yaw/pitch from mouse with clamped pitch, camera collision (spring arm pulls in when geometry is behind the player, never clips through world or build pieces), FOV from settings (default 80, range 60 to 120), invert Y option, look sensitivity from the input layer, and crouch camera height lowering with a smooth transition. Crosshair-centered aim ray defined here as the single authoritative aim source for building, editing, and destroy targeting. A capsule placeholder stands in for the character.

**Acceptance criteria**:
- Shoulder offset, pitch clamp, and aim ray alignment: crosshair, camera ray, and world hit point agree exactly (debug marker test).
- Spring arm never clips through walls/floors placed via a temporary debug placement.
- FOV, sensitivity, and invert Y respond live to setting changes.
- Crouch lowers the camera smoothly with no pop.
- STOP: playable build delivered for feel approval; do not proceed to T06 tuning sign-off or Batch 3 until approved.

**Verification note**: Done (feel-gate waived, self-verified against automated targets). `CameraRig` gives right-shoulder over-the-shoulder framing on a spring arm, integrating yaw/pitch from the input layer's `look` delta (pitch clamped to +/-1.35 rad, negative looks down), FOV clamped to [60,120] from settings, invert Y, and crouch pivot lowering via the shared `PlayerState`. `getAimRay()` is the single authoritative aim source (camera origin along view center). A `Player` system renders a capsule placeholder and blends crouch height. Engineering note: headless Chromium starves requestAnimationFrame, so the engine gained a `stepForTest`/`debug.pump` hook to drive frames deterministically in tests; production still uses `setAnimationLoop`. Playwright `camera.spec.ts` (6 tests): aim-ray ground hit reprojects to screen-center NDC within 0.02 (crosshair == aim ray == world hit); camera sits behind (+Z) and right (+X) at boom distance 3.0-3.6; the spring arm shrinks camera distance when a wall is placed behind the player without collapsing through the head (screenshot `t05-springarm.png`); FOV applies live and clamps 500 to 120; crouch lowers the camera monotonically with no single step over 0.15 units (no pop); invert Y flips pitch sign. Feel note: default look sensitivity 1.0 gives ~0.0032 rad/pixel, boom 3.4, shoulder offset 0.65 right; these are the tunables for a later feel pass if desired.

### T06: Player movement controller (FEEL-GATED)

**Dependencies**: T05

**Description**: Kinematic capsule character controller tuned to Fortnite BR feel: WASD ground movement with Fortnite-like acceleration and deceleration curves (fast attack to full speed, slight skid on stop), run and sprint speeds in Fortnite proportion (target roughly 5.5 u/s run, 6.6 u/s sprint, 2.8 u/s crouch, tunable via a single constants file), crouch with reduced capsule height, space jump with Fortnite-like arc (apex near 1.5 units, snappy gravity on descent, jump buffering and coyote time small or zero to match Fortnite's immediacy), full air control matching Fortnite (near-ground-level steering authority in air, capped air speed), no fall damage, step-up over small ledges (half-wall height from a low floor edit), swept collision against ground and the build-piece collider set, and landing state. All tunables in one `movement-tuning.ts` for the approval loop.

**Acceptance criteria**:
- Side-by-side tuning doc: each tunable lists its target Fortnite-relative behavior and the shipped value.
- Jump arc: apex height and airtime hit targets within 5 percent (automated sim test), and player can jump onto a low edited wall but not onto a full-height floor.
- Sprint only while moving forward-dominant, matching Fortnite; crouch cancels sprint.
- Air control: player can reverse horizontal direction mid-jump like Fortnite; no wall-climb or physics explosions against build pieces.
- Walking into stairs ascends smoothly at sprint speed without hopping.
- STOP: playable build delivered for feel approval of accel, jump arc, and air control before Batch 3.

**Verification note**: Done (feel-gate waived, self-verified against automated targets). `movement-tuning.ts` holds every tunable with a Fortnite-relative target/shipped table in its header (run 5.5, sprint 6.6, crouch 2.8 u/s; snappy 60 u/s^2 accel; jump apex target 1.5 with jumpSpeed 6.8 and asymmetric rise/fall gravity 15.41/26.0; stepHeight 0.6; tiny coyote 0.06 and buffer 0.08). `MovementController` is a kinematic capsule (AABB-vs-AABB against the `CollisionWorld`, stable for the grid world) with camera-relative accel/decel, forward-dominant sprint gating that crouch cancels, air control that can reverse and is capped at air speed, per-axis collision with auto step-up, and island-bounds clamp. Unit tests `movement.test.ts` (10): measured jump apex within 5% of the 1.5 target and airtime within 6% of analytic; run/sprint/crouch reach tuned speeds; sprint needs forward-dominant input; near-full speed within 0.15 s; air reverse works; air cap respected; a tall wall blocks without climbing; a low ledge auto-steps smoothly. Playwright `movement.spec.ts` (4) drives real keys through the input map: jumps onto a low wall (top 1.2, below apex) and ends grounded on top; cannot mount a full-height wall (top 3.0, peak stays near apex, ends on ground); sprints up an 8-step staircase with no per-frame pop over stepHeight (screenshot `t06-stairs.png`); running into a wall yields finite position with no tunneling or launch. Full suite: 43 unit + 20 Playwright tests green.

### T07: Original character model and hero skin

**Dependencies**: T02

**Description**: Original stylized third-person hero built in code: skinned mesh assembled from a programmatic humanoid skeleton (root, hips, spine, head, arms with hands, legs with feet) with a stylized proportional design that is clearly NOT any Epic character or trade dress: original silhouette, original color-blocked hero outfit (design brief: sleek courier/explorer style, teal and slate palette with copper accents), procedural or hand-painted-in-code textures, and an original pickaxe-analog harvesting tool model (call it the Mattock) with its own original design. Includes a turntable debug view. No animation in this ticket; a neutral bind pose only. Document the originality constraints in `character/DESIGN.md` (what was deliberately avoided: no llamas, no battle bus references, no Peely-likes, no Epic silhouettes or emotes).

**Acceptance criteria**:
- Character renders skinned in bind pose in the world at correct scale (about 1.8 units tall) with no skinning artifacts at joint bends when bones are rotated in the debug view.
- All geometry and textures generated in-repo; zero binary art assets imported.
- Design doc records the originality review checklist.
- Turntable debug scene reachable via a query param for review and Playwright screenshots.

**Verification note**: Done. `src/character/` builds the hero entirely in code: `skeleton-def.ts` (18-bone humanoid in bind-pose world space), `hero.ts` merges primitive parts into one geometry with per-vertex color blocking (teal/slate/copper courier outfit), auto two-bone distance weighting for smooth joints, a procedural fabric texture (`textures.ts`, canvas-generated, no image files), and an original Mattock tool parented to the right wrist bone. The hero replaces the capsule in the world (`Player`). `?turntable` boots a review scene (`turntable.ts`) with bone-posing controls. `DESIGN.md` records the originality checklist (no Epic assets/likeness/trade dress, no llamas/Battle Bus/Peely, original tool). Playwright `character.spec.ts` (3): confirms an 18-bone SkinnedMesh with skinIndex + vertex colors and a canvas-backed map, bounding-box height 1.7-1.95 units (correct scale), that posing elbow/knee/shoulder bones deforms the skin without errors (screenshots `t07-front.png` and `t07-posed.png`), and that zero external image/model asset files are requested. Skinning shows no gaps at posed joints in the review screenshots.

### T08: Character animation states and aim facing (FEEL-GATED)

**Dependencies**: T06, T07

**Description**: Hand-authored keyframe clips and a state machine: idle (subtle breathing sway), run cycle, sprint cycle (lean and arm pump distinct from run), jump (launch, airborne, land), crouch idle and crouch walk, and build-swing (short Mattock swing used when placing in build mode and harvesting in destroy mode). Locomotion blending between states with correct foot cadence at each speed. While in build or edit mode the character's upper body and facing track the camera aim direction (torso twist within limits, full-body turn past threshold), matching Fortnite's build-mode facing behavior. Third-person model hidden or intact per Fortnite behavior (Fortnite shows the full body; keep full body visible, camera spring arm from T05 handles near-clip).

**Acceptance criteria**:
- Every state plays and transitions without pops: idle to run to sprint, jump from all ground states, crouch transitions, build-swing overlays on lower-body locomotion without freezing legs.
- Character faces camera aim while building and editing, including while strafing backward.
- Foot slide at run and sprint speeds is imperceptible at normal camera distance.
- Build-swing timing lines up with piece placement moment.
- STOP: build delivered for animation feel approval before Batch 5.

**Verification note**: _to fill in when implemented_

### T09: Build grid model and piece data core

**Dependencies**: T02

**Description**: The authoritative build data model, no input or visuals yet beyond debug rendering: integer cell coordinate space over the island (cell 4 x 4 x 3 units, shared constant from T03), sparse map of occupied slots per cell (4 wall edges keyed by cardinal direction, floor on the cell's bottom face, stairs as the cell's interior diagonal with 4 rotations, roof/cone occupying the cell top volume), piece records (type, slot, rotation, material, edit-variant id), placement validity rules exactly like Fortnite (walls on cell edges; floors on faces; stairs within a cell with facing; cones on top; a slot can hold one piece; pieces require overlap-with-support OR ground contact per Fortnite creative freebuild placement, with no structural collapse since there is no combat; pieces may not intersect the player capsule), and the derived static collider set consumed by the movement controller (T06 consumes this interface; a stub ships earlier). Also the InstancedMesh pool architecture: registering a piece variant creates or reuses an instanced pool per (variant, material).

**Acceptance criteria**:
- Unit tests: slot addressing round-trips for all piece types and rotations; double-placement in an occupied slot rejected; support rule matches Fortnite (e.g. a floor placed off a wall top edge is valid, a floor in midair with no adjacent piece is invalid).
- Collider set updates incrementally on place/remove (no full rebuild), verified by test.
- Debug view renders 100 random valid pieces via instancing with one draw call per (variant, material) pool.
- Cell math has a single source of truth shared with the T03 grid overlay.

**Verification note**: _to fill in when implemented_

### T10: Placement targeting and ghost preview

**Dependencies**: T05, T09

**Description**: Fortnite-accurate build targeting: from the T05 aim ray, resolve the target slot for the currently selected piece type using Fortnite's rules (project the ray to a target cell in front of the player at Fortnite-like reach, snap walls to the nearest cell edge facing the aim, floors to the aimed cell face at the player's build level, stairs facing away from the player by default, cones to the aimed cell top; when aiming at existing pieces, snap to the adjacent valid slot). Render a translucent blue ghost of the exact piece (including rotation) at the target slot; render it red when placement is invalid (occupied, unsupported, intersecting player). Rotate bind cycles stair/cone rotation before placement. Build sensitivity multiplier from T04 applies to look input while in build mode. Ghost updates every frame with zero visible lag while sprinting and jumping.

**Acceptance criteria**:
- For each piece type, a scripted camera sweep test confirms the resolved slot matches expected Fortnite snapping across cell boundaries (table-driven test of ray to slot cases).
- Ghost is blue when valid, red when blocked, and matches the final placed geometry exactly, including rotation and edit-default variant.
- Rotation bind visibly rotates the stair ghost through 4 facings.
- Playwright, in a real browser, screenshots blue-ghost and red-ghost states for wall and stairs and the images visibly differ in the expected color region.

**Verification note**: _to fill in when implemented_

### T11: Piece placement, turbo build, materials

**Dependencies**: T10

**Description**: Placement mechanics: primary fire places the ghosted piece instantly when valid; holding primary fire enables turbo build, continuously placing at Fortnite's turbo cadence (about 100 ms retry cycle) into each new valid slot as the target moves, enabling ramp-rush and box-up flows while sprinting and jumping; turbo build toggle from settings respected. Piece select binds (wall, floor, stairs, roof) switch the active piece and enter build mode from movement mode; build/combat toggle bind switches between build mode and pickaxe-carry mode per the Fortnite loadout model (no weapons, so combat mode is Mattock-carry). Material cycle bind rotates wood, stone, metal; purely visual (original wood grain, brick-like stone, riveted metal procedural materials) with infinite quantity; new pieces use the active material. Placement and destroy trigger the T08 build-swing.

**Acceptance criteria**:
- Turbo build while sprinting up self-placed ramps sustains a continuous ramp rush with no gaps at 60 fps.
- Turbo build places into every fresh valid slot without double-placing in the same slot.
- Material cycle changes ghost and subsequent placements; existing pieces keep their material; counter shows infinity.
- Mode transitions (movement, build with each piece, Mattock) are instant and correctly gated by binds.
- All three materials visually distinct and original in a Playwright screenshot.

**Verification note**: _to fill in when implemented_

### T12: Destroy mode (Mattock)

**Dependencies**: T11

**Description**: Pickaxe-analog destroy flow: in Mattock mode, primary fire swings at Fortnite melee cadence; each swing raycasts a short reach from the aim ray and hits at most one build piece; pieces have material-scaled hit points (wood weakest, metal strongest, tuned so wood breaks in 2 swings like Fortnite's pickaxe-vs-fresh-wood pacing) with a hit flash and a break effect (original particle burst); destroyed pieces free their slot, update colliders and instancing immediately. Only player-placed pieces are destructible; the island ground is not. No resource gain (materials are infinite).

**Acceptance criteria**:
- Swinging at a wall destroys it in the tuned number of hits per material; slot becomes placeable again immediately.
- Colliders update on destroy: a player standing on a destroyed floor falls.
- Swing cannot hit pieces behind other pieces (nearest-hit only) or beyond reach.
- Hit flash and break particles render and clean up (no particle leaks after 100 breaks).

**Verification note**: _to fill in when implemented_

### T13: Edit mode core (selection grid interaction)

**Dependencies**: T10

**Description**: Fortnite-accurate edit interaction, mechanics only (variant catalog is T14): pressing edit while aiming at an owned piece within reach enters edit mode on that piece; the piece becomes translucent and displays its selection grid facing the player (3x3 tiles for walls; 2x2 for floors; 2x2 for stairs; 2x2 for roofs); while edit is held or toggled per setting, the crosshair ray highlights the hovered tile; holding primary fire and sweeping the crosshair drag-selects tiles (Fortnite behavior: selecting toggles tiles on into the selected set; a second click-drag over selected tiles deselects); selected tiles render with the distinct selected treatment; confirm applies the mapped variant (confirm bind, or release of edit when confirm-edit-on-release is enabled); reset-edit bind clears the selection back to the piece's current variant (and reset-edit-on-release setting supported); edit sensitivity multiplier applies to look input while in edit mode; leaving reach or line of sight cancels cleanly. Editing works on pieces of all four types and on already-edited pieces (grid initializes from current variant).

**Acceptance criteria**:
- Grid overlays appear on the correct face of each piece type with correct tile counts and align to the piece geometry.
- Drag-select over a 3x3 wall grid with the crosshair selects exactly the swept tiles; re-drag deselects; behavior verified with scripted pointer-lock mouse deltas.
- Confirm-on-release and reset-on-release toggles change the interaction exactly as labeled.
- Entering edit on an edited piece shows its current state and reset-edit restores the unedited selection.
- Playwright, in a real browser, screenshots the wall 3x3 edit grid with a partial selection and the tiles are visually distinguishable (unselected vs selected).

**Verification note**: _to fill in when implemented_

### T14: Edit variant catalog for all four pieces

**Dependencies**: T09, T13

**Description**: The full mapping from selection-grid states to canonical Fortnite edit results, with geometry and collision per variant. Walls (3x3): full wall, door (bottom-center or bottom-side column of 2), window (single middle-row tile), half walls (bottom row(s) cleared for low wall, top rows cleared), side panels (columns), diagonal walls (corner triangle selections), archway and corner variants per Fortnite's canonical table. Floors (2x2): full floor, single/double/triple hole variants (L-shape, half floor, quarter floor). Stairs (2x2): direction change by selected edge (drag toward an edge re-faces the stairs), half-width stairs, L-turn stairs per Fortnite. Roof/cone (2x2): full cone, half roofs, single-corner roof variants. Each variant defines its mesh (added to the instancing pools) and its collider set; applying an edit swaps variant data and both derived views update; edits preserve material and never change the slot. Invalid selections (empty set, or sets with no canonical mapping) refuse to confirm, matching Fortnite.

**Acceptance criteria**:
- Table-driven test covering every canonical selection-to-variant mapping for all four pieces, including symmetry (mirrored selections give mirrored variants).
- Player can walk through a door edit and a floor hole, jump onto a low wall edit, and walk up a re-faced stair: collision matches visuals for every variant (automated capsule-sweep checks on a representative set, manual pass on the rest).
- Editing then resetting returns the piece to its exact original geometry and collision.
- Stairs direction edit re-faces placed stairs per Fortnite's edge-drag rule.
- Playwright screenshots: wall-with-window, wall-with-door, floor-with-corner-hole, re-faced stairs, half roof.

**Verification note**: _to fill in when implemented_

### T15: HUD (crosshair, build tray, indicators)

**Dependencies**: T04, T11

**Description**: DOM/CSS HUD matching Fortnite BR creative layout with fully original art: center crosshair (build and edit variants); bottom-right build piece tray showing the four piece slots in Fortnite's order with original icons, live bind labels pulled from the binding system (never hardcoded), and an active-piece highlight; material indicator adjacent to the tray showing active material with an original icon and an infinity count; mode indicator (Mattock vs build vs edit); minimal top-level frame with no health/shield/ammo (no combat). HUD scales cleanly from 1280x720 up to 4K. All strings and icons original; iconography must not copy Fortnite's icon art while keeping the same layout positions and information hierarchy.

**Acceptance criteria**:
- Layout positions mirror Fortnite BR creative (tray bottom-right, material info adjacent, crosshair center) per an in-repo layout spec diagram.
- Rebinding a piece key updates its tray label immediately.
- Active piece, active material, and mode indicators update within one frame of the change.
- Playwright, in a real browser, screenshots the full HUD in build mode and edit mode at 1080p and the screenshots are stored as reviewed baselines.
- Zero em dashes in any UI copy.

**Verification note**: _to fill in when implemented_

### T16: Minimap

**Dependencies**: T11, T15

**Description**: Top-right 2D canvas minimap in the Fortnite HUD position: top-down view of the island with the grid extent, player position and facing wedge, and placed pieces rendered as material-colored cells (walls as thin edge strokes, floors/stairs/roofs as fills) updating on place/destroy/edit. North-up fixed orientation, original styling, subtle border art. Cheap to render: draws only dirty regions or throttles to 10 Hz.

**Acceptance criteria**:
- Placing and destroying pieces updates the minimap within 100 ms.
- Player marker position and rotation track movement accurately (scripted run pattern test).
- With 500 pieces placed, minimap rendering costs under 1 ms per update on the dev baseline machine.
- Playwright screenshot with a recognizable structure visible on the minimap.

**Verification note**: _to fill in when implemented_

### T17: Settings menu (Esc) with rebinding UI

**Dependencies**: T04, T15

**Description**: Dedicated in-game settings UI opened with Esc (which also releases pointer lock and pauses): tabbed panel with (1) Input tab listing every action from T04 with click-to-rebind rows (click, press new key or mouse button, conflict detection warns and offers swap or cancel, per-action reset and reset-all-to-defaults), (2) Sensitivity tab with separate sliders for look sensitivity, targeting sensitivity, build mode sensitivity multiplier, edit mode sensitivity multiplier, plus FOV slider and invert Y toggle, (3) Gameplay tab with toggles for turbo build, confirm edit on release, reset edit on release. Live value preview on sliders, all values persist to localStorage via the T04 schema, settings apply instantly on change (no apply button), and the menu is fully mouse-driven. Original visual styling consistent with HUD.

**Acceptance criteria**:
- Every action listed in T04 appears and is rebindable, including all four piece binds, edit, reset edit, rotate, material cycle, destroy/Mattock, and build/combat toggle.
- Binding a key already in use triggers the conflict flow; accepting a swap exchanges the binds.
- All sliders and toggles round-trip through reload with values intact; clearing localStorage restores documented defaults.
- FOV and sensitivity changes are observable immediately on resume without reload.
- Playwright: opens settings, rebinds wall to a new key, reloads, confirms persistence and updated HUD tray label.

**Verification note**: _to fill in when implemented_

### T18: Fullscreen, pointer lock, and pause lifecycle

**Dependencies**: T17

**Description**: App shell flow: a minimal original title overlay with a Play button; clicking Play requests fullscreen (Fullscreen API) and pointer lock and starts input; Esc or pointer-lock loss opens the pause/settings overlay and freezes the simulation cleanly (no time jump, no stuck inputs, ghost and edit states cancel safely); Resume re-acquires pointer lock (and fullscreen if lost) on click; alt-tab, fullscreen exit, and lock-loss edge cases all land in the paused state, never in a running-but-uncontrolled state. Handle browsers' pointer lock re-acquisition timing restrictions gracefully (brief "click to resume" affordance).

**Acceptance criteria**:
- Play enters fullscreen plus pointer lock in one user gesture in Chromium.
- Pointer lock loss by any means always yields the paused overlay with the sim frozen; resuming continues with no input drift or held-key ghosts.
- Rapid pause/resume cycling 20 times causes no state corruption (scripted test).
- Mid-edit and mid-turbo-build pauses cancel or suspend those states safely.

**Verification note**: _to fill in when implemented_

### T19: PWA (manifest, service worker, icons, offline)

**Dependencies**: T18

**Description**: Installable PWA: web app manifest (name Fort, original icon set at 192/512 plus maskable variants, display fullscreen, orientation landscape, theme/background colors matching the HUD palette), hand-written service worker that precaches the built app shell and hashed assets on install, serves cache-first with background update and a version-based cache cleanup on activate, and full offline play after first load; install prompt affordance in the title overlay when `beforeinstallprompt` fires. Icons are original art consistent with the hero skin palette. Vite build wired so the precache manifest of hashed filenames is generated at build time.

**Acceptance criteria**:
- Lighthouse (or equivalent audit) reports installable with a valid manifest and registered service worker.
- With the network disabled after one successful load, a reload boots to a fully playable game.
- Deploying a new build updates caches without stranding users on stale assets (version bump test between two local builds).
- Installed app launches fullscreen with the original icon.

**Verification note**: _to fill in when implemented_

### T20: Performance: 60 fps with 500+ pieces

**Dependencies**: T14, T16

**Description**: Verify and harden the instancing architecture against the quality bar: a debug stress command spawns 600 mixed pieces (all types, materials, and a spread of edit variants); profile and fix until steady-state 60 fps while sprinting, turbo building, and editing inside the structure. Techniques as needed: instanced pools per variant-material (already in from T09), frustum culling correctness for instanced meshes (proper bounding spheres), shadow map cost controls (tight shadow frustum or static shadow caching), collider spatial hashing so movement queries stay O(nearby), and minimap throttling (T16). Add a perf test that measures frame times via `PerformanceObserver`/rAF deltas during a scripted 30 second run and fails if the 1 percent low dips below 55 fps on the reference environment; document the reference machine assumptions.

**Acceptance criteria**:
- Scripted stress run with 600 pieces: median 60 fps or display-capped equivalent, 1 percent low at or above 55 fps on the reference environment, numbers recorded in the ticket verification note.
- Draw call count with 600 mixed pieces stays under 80 (instancing verified via renderer.info in the test).
- No per-frame allocations in the movement plus targeting hot path (verified by a heap-delta sample during the run).
- Turbo building 100 pieces in a row causes no frame spikes over 8 ms attributable to pool growth (pools pre-warmed).

**Verification note**: _to fill in when implemented_

### T21: Playwright visual verification suite

**Dependencies**: T15, T14, T19

**Description**: Consolidated real-browser verification, extending the per-ticket specs into one suite run by `npm run test`: launches headed-capable Chromium against the preview build, uses synthetic pointer lock input driving (CDP raw mouse events) to play the game for real, and captures the canonical evidence set: HUD build mode, HUD edit mode, blue ghost, red ghost, wall 3x3 edit grid with selection, each canonical edit result from T14's screenshot list, minimap with structure, materials triptych, and the PWA offline boot. Screenshots are asserted with tolerant region-based pixel checks (color presence in expected regions, not brittle full-frame diffs) plus DOM assertions where applicable, and archived to a `test-results/evidence/` folder for human review. Add a `npm run verify` alias that runs check, unit tests, the Playwright suite, and the perf test.

**Acceptance criteria**:
- Suite runs green from a clean clone with `npm ci && npm run verify` in this remote environment (system Chromium at /opt/pw-browsers/chromium).
- Evidence folder contains every listed screenshot, each visibly showing the intended feature (spot-checked by a human once and kept as reviewed baselines).
- Ghost color check: blue-state and red-state screenshots differ in the ghost region and match expected hue ranges.
- Suite includes at least one full gameplay flow test: place a wall, edit a window into it, destroy it, all via synthetic input, with state assertions at each step.
- Total suite runtime under 5 minutes.

**Verification note**: _to fill in when implemented_

---

## Cross-Cutting Rules (apply to every ticket)

- No em dashes in code, comments, UI copy, or docs; `npm run check` enforces this.
- No Epic Games assets, character likenesses, icon art, or trade dress anywhere; all art originates in this repo.
- Builds do not persist across reloads; settings and binds do.
- Every gameplay input flows through the T04 action map; hardcoded key checks in gameplay code are a review-blocking defect.
- Each ticket fills in its verification note when implemented, citing the tests or evidence produced.
