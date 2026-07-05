# Fort Phase 0 Audit: Current-State Inventory

Status: Phase 0 of the Fortnite parity brief (`docs/fortnite-parity-brief.md`).
This document is a file-cited inventory of every Fortnite-relevant system as it
exists today, plus the list of captured "before" screenshots. It is description
only. No judgement, no deltas, no recommendations; those come in Phase 2
(`docs/gap-analysis.md`) and Phase 3 (`docs/design.md`).

Provenance: the systems below were shipped across tickets T01 through T21 (see
`TICKETS.md`). Every value quoted here is the value shipped in the current tree
on branch `claude/fort-creative-sandbox-plan-8olubx`.

## How to read this

- Fort uses metric-ish world units where roughly 1 unit is 1 meter. One build
  cell is 4 units wide (X and Z) and 3 units tall (Y). These are not hardcoded
  per file; they come from `src/world/grid.ts` (see the Grid section).
- Citations are `path` and, where useful, `path:line` plus the symbol name.
  Values are quoted as shipped. Colors are given as the source hex literal.
- Each system is recorded as four fields: what it does today, files and key
  symbols, current tunable values, and the seams a change would touch.

## Repository shape and toolchain

Fort is Vite + TypeScript + vanilla Three.js (`three@^0.169`), a single WebGL2
scene, single player, desktop only, shipped as an installable fullscreen PWA
(`package.json`). Source is organized by system under `src/`. There is no
gameplay networking and no external asset pipeline; all textures, geometry, and
animation are authored or generated in code.

Commands (`package.json` scripts):

- `npm run check` runs `tsc --noEmit`, then `eslint . --max-warnings 0`, then the
  no-em-dash scan (`scripts/check-no-emdash.mjs`). Fast gate.
- `npm run test:unit` runs the Vitest suites (pure logic, node): the `*.test.ts`
  files colocated in `src/`.
- `npm run test:verify` runs `tests/verify.spec.ts`, the consolidated Playwright
  run that writes the canonical evidence set to `test-results/evidence/`.
- `npm run test` runs the full Playwright suite under `tests/`.
- `npm run dev` / `npm run build` / `npm run preview` for the app.

The no-em-dash gate (`scripts/check-no-emdash.mjs`) scans every git-tracked text
file (`.ts`, `.md`, and other text extensions) via `git ls-files` and fails the
build if U+2014 appears anywhere.

## The engine and test harness

### Fixed-step loop and the System interface

What it does today: `Game` owns the Three.js renderer, scene, camera, an event
bus, and an ordered list of `System` objects. Each rendered frame it feeds the
wall-clock delta to a `FixedStepper`, runs `fixedUpdate(dt)` for every system
once per fixed step, then `update`, `render`, and `lateUpdate` once per frame,
then renders. The sim runs at a fixed 120 Hz independent of display refresh; the
accumulator is clamped to 8 steps so a long stall cannot trigger a spiral of
death. `stepForTest()` runs exactly one frame with a controlled delta so headless
tests are deterministic (headless browsers throttle requestAnimationFrame).
Pause freezes the sim clock while rendering continues.

Files and key symbols:

- `src/core/game.ts`: `System` interface (`game.ts:10`), `Game` class
  (`game.ts:26`), `stepForTest` (`game.ts:118`), the `frame` loop
  (`game.ts:122`), `pause`/`resume` (`game.ts:94`, `game.ts:100`),
  `onVisibilityChange` auto-pauses on `document.hidden` (`game.ts:159`).
- `src/core/time.ts`: `FixedStepper` (`time.ts:20`), `advance` (`time.ts:38`).
- `src/core/events.ts`: `EventBus` (`events.ts:7`), `AppEvents` map
  (`events.ts:41`: `resize`, `pause`, `resume`, `input:changed`).
- `src/core/debug-overlay.ts`: `DebugOverlay` (`debug-overlay.ts:12`), an
  fps/frame-time/sim-steps/draw-calls readout toggled with Backquote.

Current tunable values:

- Sim rate: `simHz ?? 120` (`game.ts:45`); `FixedStepper` default `hz = 120`,
  `maxSteps = 8` (`time.ts:26`). Fixed delta is `1/120` s.
- Renderer: `antialias: true`, `powerPreference: "high-performance"`, pixel ratio
  `min(devicePixelRatio, 2)`, `outputColorSpace = SRGBColorSpace`, shadow map
  enabled with `PCFSoftShadowMap` (`game.ts:47-53`).
- Camera constructed as `PerspectiveCamera(70, aspect, 0.1, 1000)`
  (`game.ts:57`); the 70 is a boot placeholder, overridden every frame by the FOV
  setting (default 80) via the camera rig.
- Frame-time smoothing factor `0.1` (`game.ts:125`).

Seams a change would touch: every system implements `System`; the ordered add in
`src/main.ts` fixes update order (input, world, player, camera, build, edit,
build/destroy controllers, hud, minimap, settings, session). Changing the sim
rate changes every `fixedUpdate` dt and any test that pumps a fixed frame count.

### The window.__fort.debug surface

What it does today: `src/main.ts` boots the game, wires every system together,
and exposes `window.__fort` (`game`, `input`, `player`, `cameraRig`, `debug`) and
sets `window.__fortReady = true`. The `debug` object is the deterministic control
and inspection API that all Playwright specs drive. Nothing in it is gameplay; it
is the test seam. The `?turntable` query param boots the character review scene
instead of the game.

Files and key symbols: `src/main.ts` builds `debug` (`main.ts:156-439`). Key
groups and representative members:

- Engine and camera: `pump(frames)` (`main.ts:206`), `teleport(x,y,z)`
  (`main.ts:187`), `setYaw` / `setPitch` (`main.ts:192`, `main.ts:195`),
  `aimGroundHit()` (`main.ts:198`), `placeBox` / `placeSolid` (`main.ts:157`,
  `main.ts:169`).
- `build.*`: place by cell address `wall/floor/stairs/roof`, `removeFloor`,
  `scatter`, `placeSlotKey`, `materialAt`, `hpAt`, `variantAt`, `applyEdit`,
  `count`, `drawCalls`, `colliderCount` (`main.ts:226-272`).
- `perf.*`: `stress`, `poolGrows`, `drawCalls`, `nearComparisons`, `placeRow`
  (`main.ts:274-300`) - the deterministic performance proxies the brief requires
  in place of wall-clock fps.
- `target.*`: `setActive`, `setMode`, `setPiece`, `cycleRotation`,
  `cycleMaterial`, `setTurbo`, `info`, `ghostColorHex` (`main.ts:302-342`).
- `edit.*`: `forceHover`, `state`, `isEditing` (`main.ts:344-354`).
- `hud.*`, `session.*`, `settings.*`, `minimap.*`, `destroy.*`
  (`main.ts:356-438`).

Current tunable values: none (pure test surface). Debug overlay toggle is
Backquote (`debug-overlay.ts:18`); the live action-state overlay toggle is
Backslash (`src/input/debug-input-overlay.ts`, wired at `main.ts:149`).

Seams a change would touch: every Playwright spec under `tests/` depends on these
names; renaming a `debug.*` method breaks the corresponding spec. New systems
that want headless verification add their own `debug.*` group here.

### Grid: the single source of truth

What it does today: `src/world/grid.ts` is the single source of truth for the
build lattice. Every system that snaps to cells imports these constants and
helpers; the file header states nothing else may hardcode 4 or 3 for cell
dimensions. Across the whole audit this contract holds: every consumer imports
`CELL_SIZE` / `CELL_HEIGHT` rather than restating them (verified in build, edit,
world, minimap, targeting, colliders, and movement).

Files and key symbols: `src/world/grid.ts`. Constants and helpers:

| Symbol | Value | Line |
|---|---|---|
| `CELL_SIZE` | 4 | `grid.ts:12` |
| `CELL_HEIGHT` | 3 | `grid.ts:15` |
| `ISLAND_CELLS` | 40 | `grid.ts:18` |
| `ISLAND_SIZE` | 160 (`CELL_SIZE * ISLAND_CELLS`) | `grid.ts:21` |
| `ISLAND_HALF` | 80 | `grid.ts:24` |
| `CELL_MIN` | -20 | `grid.ts:27` |
| `CELL_MAX` | 19 | `grid.ts:30` |

Helpers: `cellOrigin`, `cellCenter`, `worldToCell`, `cellInBounds`,
`clampToIsland` (`grid.ts:38-60`). The scale rationale in the header states the
4:4:3 footprint-to-height ratio is chosen to mirror Fortnite's roughly
512:512:384 build units.

Seams a change would touch: changing `CELL_SIZE` or `CELL_HEIGHT` ripples through
placement (`src/build/slots.ts` `slotPlacement`), collision box geometry
(`src/build/colliders.ts`, `src/build/variants.ts`), targeting
(`src/build/targeting.ts`), the edit grid (`src/edit/edit-grid.ts`,
`src/edit/variants-catalog.ts`), the world ground/grid overlay
(`src/world/island.ts`), and the minimap scale (`src/hud/minimap.ts`). This is
the highest-blast-radius constant in the codebase.

## Fortnite-relevant systems

### 1. Character and skin

What it does today: `buildHero()` procedurally builds a stylized humanoid at
runtime from primitives (boxes, capsules, one sphere), merges them into one
`BufferGeometry`, colors each part per-vertex from a fixed 5-color palette, and
lays a small procedural canvas "fabric weave" texture over it. The mesh is bound
to a 17-bone skeleton by automatic two-nearest-bone distance weighting (no
hand-painted weights). A separate `buildMattock()` group (a wooden-haft
harvesting tool, deliberately not a pickaxe silhouette) parents onto the right
wrist bone. The hero stays the blank / original skin; `src/character/DESIGN.md`
is the originality record. Seven hand-authored animation clips drive locomotion
and a build swing; the aim-mode path adds a clamped spine twist. A `?turntable`
review scene renders the hero on a rotating platform for inspection.

Files and key symbols:

- `src/character/hero.ts`: `buildHero()` (`hero.ts:300`), `buildParts()`
  (`hero.ts:141`), `computeSkinWeights()` (`hero.ts:186`), `buildMattock()`
  (`hero.ts:264`), `buildHeroSkeleton()` (`hero.ts:239`).
- `src/character/skeleton-def.ts`: `BONES` list (`skeleton-def.ts:12`),
  `HERO_HEIGHT = 1.8` (`skeleton-def.ts:38`), `childrenOf` (`skeleton-def.ts:41`).
- `src/character/clips.ts`: `makeClips()` (`clips.ts:96`), `locomotionKeys()`
  (`clips.ts:46`), reference speeds (`clips.ts:40-41`).
- `src/character/animation-controller.ts`: `AnimationController`
  (`animation-controller.ts:20`), `pick` (`:46`), `setState` (`:54`),
  `triggerBuildSwing` (`:78`).
- `src/character/textures.ts`: `makeFabricTexture` (`textures.ts:18`).
- `src/character/turntable.ts`: `Turntable` system (`turntable.ts:9`),
  `bootTurntable` (`turntable.ts:63`).
- `src/character/DESIGN.md`: palette and Mattock originality record.

Current tunable values:

- Palette (`hero.ts:13-17`): `TEAL 0x27a3a0`, `SLATE 0x3c4a57`, `DARK 0x232d36`,
  `COPPER 0xcf7d3c`, `HELMET 0x455361`. Body material `vertexColors: true`,
  `roughness: 0.7`, `metalness: 0.05` (`hero.ts:305-310`).
- Skeleton: 17 bones with bind-pose world positions, feet at y = 0, standing head
  near y = 1.66 (`skeleton-def.ts:13-34`). `HERO_HEIGHT = 1.8`.
- Fabric texture: 128 px canvas, PRNG seed `0x2c10_77aa`, base `#9a9a9a`, weave
  values clamped to [120, 200], `repeat.set(3, 3)` (`textures.ts:24-46`).
- Mattock: haft `CylinderGeometry(0.022, 0.026, 0.62, 8)` color `0x7a5230`; head
  `BoxGeometry(0.26, 0.07, 0.06)` color `0x51606b` metalness 0.4; cap color =
  COPPER (`hero.ts:270-294`); parented at `(-0.02,-0.12,-0.02)` rot
  `(0.5,0,0.15)` on wristR (`hero.ts:326-327`).
- Animation: 7 clips `idle, run, sprint, crouchIdle, crouchWalk, jump,
  buildSwing`. `RUN_REFERENCE_SPEED 3.24`, `SPRINT_REFERENCE_SPEED 4.85`
  (`clips.ts:40-41`); `WALK_THRESHOLD 0.4`, `SPRINT_SPEED 6.0`
  (`animation-controller.ts:15,18`); crossfade `0.15` s
  (`animation-controller.ts:62`); `buildSwing` duration `0.42` s
  (`clips.ts:133`). Note: the animation sprint threshold `6.0` is a separate
  literal from the movement `sprintSpeed 6.6`.
- Turntable: background `0x1a2730`, hemisphere `1.1`, key light `2.2` at
  `(3,5,4)`, rim `0.8`, camera at `(0,1.2,3.1)` fov 45 (`turntable.ts:20-44`).

Seams a change would touch: bone names are the contract shared by
`skeleton-def.ts`, `hero.ts` part placement, `clips.ts` keyframes,
`animation-controller.ts` track resolution, and `turntable.ts` `poseBone`. The
player system (`src/player/player.ts`) constructs the hero and animation
controller and reads `getHero().bones`. `DESIGN.md` goes stale if palette or the
Mattock shape changes. `HERO_HEIGHT` (skeleton) and `PLAYER.standHeight` are both
1.8 and kept in sync by convention, not a shared reference.

### 2. Player proportions and collision

What it does today: `player-state.ts` holds the capsule radius and stand/crouch
heights and eye heights, blends between stand and crouch over time, and exposes
`headPosition` (the camera pivot). `collision.ts` is an axis-aligned bounding box
(AABB) world, explicitly not a true capsule: the player is modeled as an AABB
against static AABBs, accelerated by a 2D (X/Z) spatial hash so movement queries
only nearby boxes. `Player` (the system) owns the state, collision world, hero,
and movement controller, spawns the hero, computes body-facing yaw, and squashes
the hero vertically to match the crouch blend.

Files and key symbols:

- `src/player/player-state.ts`: `PLAYER` (`player-state.ts:6`), `PlayerState`
  (`:21`), `updateCrouchBlend` (`:35`), `height`/`eyeHeight` getters (`:45`,
  `:49`), `headPosition` (`:54`).
- `src/player/collision.ts`: `Box` (`collision.ts:11`), `makeBox` (`:24`),
  `CollisionWorld` (`:52`), `near` spatial-hash query (`:100`), `boxesOverlap`
  (`:150`).
- `src/player/player.ts`: `Player` (`player.ts:14`), spawn (`player.ts:40`),
  `getCollisionBox` (`:58`), `fixedUpdate` (`:79`), `update` (`:85`).

Current tunable values:

- `PLAYER` (`player-state.ts:6-15`): `radius 0.4`, `standHeight 1.8`,
  `crouchHeight 1.2`, `standEye 1.62`, `crouchEye 1.05`, `crouchLerpRate 12`.
- Spawn position `(0, 0, 6)`, spawn yaw `Math.PI` (`player.ts:40-43`).
  `bodyTurnRate 12` rad/s (`player.ts:27`); facing switches to movement direction
  above speed `0.4` (`player.ts:95`); aim-mode spine twist clamped to
  `[-0.5, 0.5]` rad (`player.ts:115`).
- Collision spatial hash: `BUCKET 8` world units (documented as 2 build cells)
  (`collision.ts:46`).

Seams a change would touch: `PLAYER.radius` and heights feed the movement
collision sweep, `getCollisionBox` (consumed by build placement rejection in
`build-model.ts`), and the camera pivot. `BUCKET` is derived informally from
`CELL_SIZE` but declared as its own literal.

### 3. Movement

What it does today: `MovementController.step(dt)` reads named actions
(`moveForward/Back/Left/Right`, `sprint`, `crouch`, `jump`), builds a
camera-relative move direction from the camera yaw, accelerates toward a target
speed (run, sprint forward-only, or crouch), applies jump with small coyote and
buffer windows, applies asymmetric gravity (floatier rise, snappier fall) capped
at terminal velocity, then integrates per axis with collision resolution and
step-up over low ledges, and clamps the player to the island. Air control steers
with strong authority but caps horizontal air speed.

Files and key symbols:

- `src/player/movement.ts`: `MovementController` (`movement.ts:22`), `step`
  (`:40`), `moveY` (`:150`), `moveHorizontal` with step-up (`:198`),
  `canStandAt` (`:229`), `refreshNear` (`:120`).
- `src/player/movement-tuning.ts`: `MOVE` table (`movement-tuning.ts:24`),
  `jumpApex()` (`:44`), `jumpAirtime()` (`:49`).

Current tunable values (`MOVE`, `movement-tuning.ts:24-41`):

| Tunable | Value | Unit |
|---|---|---|
| runSpeed | 5.5 | u/s |
| sprintSpeed | 6.6 | u/s |
| crouchSpeed | 2.8 | u/s |
| groundAccel | 60 | u/s^2 |
| groundDecel | 55 | u/s^2 |
| airAccel | 45 | u/s^2 |
| airMaxSpeed | 6.6 | u/s |
| jumpSpeed | 6.8 | u/s |
| riseGravity | 15.41 | u/s^2 |
| fallGravity | 26.0 | u/s^2 |
| maxFallSpeed | 40 | u/s |
| coyoteTime | 0.06 | s |
| jumpBuffer | 0.08 | s |
| stepHeight | 0.6 | units |
| jumpApexTarget | 1.5 | units |

Derived: `jumpApex()` = `jumpSpeed^2 / (2 * riseGravity)` = about 1.50 units;
`jumpAirtime()` combines rise and fall time. Sprint is forward-dominant only and
disabled while crouching (`movement.ts:52-53`).

Seams a change would touch: `yawSource` is the camera yaw (`main.ts:62`); the
animation controller reads the resulting speed to pick clips; `stepHeight 0.6` is
mirrored by the stair tread height (`STAIR_STEPS 6` over a 3-unit cell gives 0.5
per tread, inside 0.6). Every movement value is feel-gated (T05/T06 in
`TICKETS.md` are marked FEEL-GATED).

### 4. Camera

What it does today: `CameraRig` is a third-person over-the-shoulder camera. Yaw
and pitch come from the input layer's look delta; the camera sits behind and to
the right of the head on a spring arm that pulls in when geometry is between the
pivot and the camera (raycast against registered colliders). The aim ray (camera
origin along the view center, the crosshair) is the single authoritative aim
source that building, editing, and destroy all consume. FOV comes from settings,
clamped, applied when it changes.

Files and key symbols: `src/player/camera-rig.ts`: `CameraRig` (`camera-rig.ts:36`),
`DEFAULT_CAMERA_TUNING` (`:27`), `update` (`:81`), `getAimRay` (`:136`),
`addCollider` (`:72`), `PITCH_LIMIT` (`:13`).

Current tunable values:

- `PITCH_LIMIT 1.35` rad (about 77 degrees) (`camera-rig.ts:13`); spawn yaw 0,
  pitch `-0.1` (`camera-rig.ts:39-40`).
- `DEFAULT_CAMERA_TUNING` (`camera-rig.ts:27-34`): `shoulderRight 0.65`,
  `shoulderUp 0.15`, `boomDistance 3.4`, `collisionSkin 0.25`, `minHeight 0.4`,
  `minBoom 0.6`.
- FOV from `input.settings.fov` (default 80) via `clampFov` (60 to 120).

Seams a change would touch: the spring-arm collider list is fed by the ground and
every build pool mesh (`main.ts:65-76`); the aim ray is consumed by targeting,
edit, and destroy. `lookContext` swaps to `build`/`edit` so per-context
sensitivity applies.

### 5. Build grid model and pieces

What it does today: four piece types (wall, floor, stairs, roof) and three
materials (wood, stone, metal). A `Slot` is either a wall slot (axis, grid line,
span, storey) or a cell slot (cx/cy/cz for floor/stairs/roof); wall edges shared
by two cells canonicalize to one slot. `slotKey`/`decodeSlotKey` round-trip a slot
to a string used as the model's map key. `slotPlacement` converts slot plus
rotation to a world position and yaw, base-anchored so geometry bottoms sit at
y = 0. `BuildModel` is the authoritative sparse map from slot key to a stored
piece (material, rotation, edit-variant id, pool key, instance index, collider
handles, hit points); placement runs bounds/occupancy/support validation, adds an
InstancedMesh instance, and registers colliders. Removal is swap-remove on both
the instance pool and collider set. `applyEdit` swaps a placed piece to a
different geometry variant in place. Placement support rules mirror Fortnite
freebuild: base pieces at storey 0 rest on the island; higher pieces need a
structural neighbor.

Files and key symbols:

- `src/build/piece.ts`: `PieceType` / `PIECE_TYPES` (`piece.ts:6-7`), `Material`
  / `MATERIALS` (`:9-10`), `Rotation` (`:13`), `WallSlot`/`CellSlot`/`Slot`
  (`:22-39`), `pieceType` (`:51`).
- `src/build/slots.ts`: `slotKey` (`slots.ts:14`), `decodeSlotKey` (`:23`),
  `wallOnEdge` (`:35`), `wallBorderCells` (`:49`), `floorSlot`/`stairsSlot`/
  `roofSlot`/`wallSlot` (`:62-73`), `slotPlacement` (`:84`).
- `src/build/rules.ts`: `BUILD_MAX_LEVEL = 40` (`rules.ts:18`), `checkPlacement`
  (`:29`), `isSupported` (`:52`), `supportNeighbors` (`:63`).
- `src/build/build-model.ts`: `BuildModel` (`build-model.ts:121`), `PoolRegistry`
  (`:28`), `MATERIAL_HP` (`:108`), `place` (`:166`), `applyEdit` (`:186`),
  `damageAt` (`:250`), `raycastPiece` (`:267`), `removeAt` (`:291`).
- `src/build/colliders.ts`: `WALL_THICK`/`FLOOR_THICK` (`colliders.ts:11-12`),
  `STAIR_STEPS` (`:17`), `ROOF_LAYERS` (`:19`), `pieceColliders` (`:25`).
- `src/build/variants.ts`: `baseGeometry` (`variants.ts:16`), `stairGeometry`
  (`:30`), `roofGeometry` (`:47`), `MATERIAL_COLOR` (`:60`).

Current tunable values:

- `BUILD_MAX_LEVEL 40` storeys (`rules.ts:18`); placement is valid at cy 0 to 40.
- `MATERIAL_HP` (`build-model.ts:108`): `wood 2`, `stone 3`, `metal 5` (tuned so
  wood breaks in 2 Mattock swings). Default place material `wood`, rotation `0`
  (`build-model.ts:168-169`).
- Geometry: wall `BoxGeometry(4, 3, WALL_THICK)`, floor `BoxGeometry(4,
  FLOOR_THICK, 4)` (`variants.ts:19-21`); `WALL_THICK 0.3`, `FLOOR_THICK 0.3`
  (`colliders.ts:11-12`). Stairs discretized into `STAIR_STEPS 6` treads
  (`colliders.ts:17`), tread height 0.5 within player step-up 0.6. Roof is a
  4-sided `ConeGeometry(CELL_SIZE * 0.72, CELL_HEIGHT, 4)` rotated 45 degrees
  (`variants.ts:48-50`); collider approximated by `ROOF_LAYERS 3` stacked boxes
  (`colliders.ts:19`).
- Fallback flat material colors (`variants.ts:61-63`): `wood 0x9c6b3f`, `stone
  0x8a8f96`, `metal 0x6f7c8a`.

Seams a change would touch: `slotKey` format is the map key across `build-model`,
targeting, edit, and the minimap piece iteration. `slotPlacement` feeds the
ghost, colliders, and instance transforms. `WALL_THICK`/`FLOOR_THICK` and
`STAIR_STEPS` are shared by imports between visual geometry and physical
colliders, so they stay coupled. `MATERIAL_HP` drives the Mattock swing counts.

### 6. Placement, targeting, ghost, and turbo

What it does today: `resolveTarget` turns the camera aim ray plus player position
into a target slot and rotation. It computes the player build storey from feet Y,
projects the aim ray onto that storey's plane (or a fixed reach point if the ray
does not cross), clamps to reach and island bounds, then per piece type: floors
target the aimed cell; walls snap to the nearest of the four cell edges; stairs
auto-face away from the player plus a rotate offset; roofs use the rotate offset.
`Ghost` is a single reusable translucent mesh whose geometry swaps per piece type
and whose material swaps between a fixed valid (blue) and invalid (red) color.
`BuildController` runs a three-state mode machine (movement, build, mattock);
piece binds select the piece and force build mode; it resolves the target each
frame, asks the model whether placement is valid (including the player's own
box), updates the ghost, and places on a single primary-fire tap or, when the
turbo toggle is on and fire is held, on a fixed cadence into fresh slots.

Files and key symbols:

- `src/build/targeting.ts`: `BUILD_REACH` (`targeting.ts:17`), `resolveTarget`
  (`:46`), `buildLevel` (`:42`), `nearestEdgeWall` (`:101`), `autoFace` (`:125`).
- `src/build/ghost.ts`: `Ghost` (`ghost.ts:14`), `VALID_COLOR`/`INVALID_COLOR`
  (`:11-12`), `show` (`:52`).
- `src/build/build-controller.ts`: `BuildController` (`build-controller.ts:32`),
  `BuildMode` (`:19`), `TURBO_INTERVAL` (`:22`), `PIECE_BINDS` (`:25-30`),
  `setMode` (`:67`), `cycleRotation` (`:115`), `cycleMaterial` (`:123`), `update`
  (`:148`), turbo timer in `updateBuild` (`:178`), `placeTarget` (`:222`).

Current tunable values:

- `BUILD_REACH 12` world units (`targeting.ts:17`). Storey from feet uses a
  `+ 0.5` bias divided by `CELL_HEIGHT` (`targeting.ts:43`), clamped to
  `[0, BUILD_MAX_LEVEL]`.
- Ghost: `VALID_COLOR 0x2f7fff` (blue), `INVALID_COLOR 0xff3b30` (red), opacity
  `0.42`, `renderOrder 10`, `frustumCulled = false` (`ghost.ts:11-36`).
- `TURBO_INTERVAL 0.1` s (about 100 ms between turbo placements)
  (`build-controller.ts:22`). Defaults: mode `movement`, piece `wall`, material
  `wood`, rotation offset `0` (`build-controller.ts:36-39`). Turbo is gated by
  `gameplay.turboBuild` (default true) and only fires into a slot different from
  the last placed.

Seams a change would touch: the target type is consumed by the controller and the
ghost; turbo cadence pairs with the instance pool pre-warm capacity. Mode changes
set `CameraRig.lookContext` and `Player.aimMode`. The controller holds the shared
`gameplay` object also owned by the settings menu.

### 7. Materials

What it does today: two material paths. `variants.ts` `baseMaterial` is a flat
solid-color `MeshStandardMaterial` used as the default factory and in node/test
environments. `materials.ts` `makeBuildMaterial` is the browser procedural path:
a 128 px canvas texture per material (vertical wood grain with knots, staggered
brick stone with mortar, riveted blue-gray metal panels), seeded for wood and
stone so output is deterministic for stable screenshots. The browser injects the
procedural factory at boot (`main.ts:75` passes `makeBuildMaterial`).

Files and key symbols: `src/build/materials.ts`: `woodTexture` (`materials.ts:39`),
`stoneTexture` (`:60`), `metalTexture` (`:86`), `FACTORIES` (`:124`),
`makeBuildMaterial` (`:131`). `src/build/variants.ts`: `MATERIAL_COLOR` (`:60`),
`baseMaterial` (`:67`).

Current tunable values:

- Procedural roughness/metalness (`materials.ts:134-135`): metal `roughness 0.45,
  metalness 0.65`; wood/stone `roughness 0.9, metalness 0.05`. Texture size 128,
  anisotropy 4.
- Wood: base `#8a5a30`, seed `0x7700_d1a1` (`materials.ts:41-56`). Stone: mortar
  `#41474d`, seed `0x5107_e2b3`, 6 rows (`materials.ts:63-82`). Metal: base
  `#6d7a88`, seam `#4a545f`, rivets at fractional `[0.12,0.38,0.62,0.88]`
  (`materials.ts:88-121`).

Seams a change would touch: `baseMaterial` (node) and `makeBuildMaterial`
(browser) must stay visually consistent; both keyed by the `Material` type.
Materials are independent of `MATERIAL_HP` and of the minimap `MAP_COLOR`.

### 8. Edit mode

What it does today: pressing edit while aiming at an owned piece within reach
enters edit mode; the piece's current variant is snapshotted as a baseline tile
selection and an overlay grid appears (3x3 for walls, 2x2 for floor/stairs/roof).
Holding primary fire drag-selects tiles; the first tile touched decides add vs
remove (Fortnite behavior). A reset action restores the baseline. Confirm happens
on press or on release depending on `gameplay.confirmEditOnRelease`; on confirm
the selection resolves through the variant catalog to a variant id plus rotation
and is applied to the model in place. Leaving reach or the piece vanishing cancels
without applying. The variant catalog maps a tile mask to a canonical variant:
walls and floors treat selected tiles as holes removed (windows, doors, half
walls, floor holes); stairs and roofs use edge pairs to re-face and single tiles
to make narrow or corner variants.

Files and key symbols:

- `src/edit/edit-grid.ts`: `faceFrame` (`edit-grid.ts:36`), `rayTile` (`:112`),
  `tileAtPoint` (`:96`), `tileCenter` (`:122`), `gridDims`/`tileCount` (`:27-33`).
- `src/edit/edit-controller.ts`: `EDIT_REACH = 9` (`edit-controller.ts:25`),
  `EditController` (`:27`), `tryEnter` (`:98`), `updateHoverAndDrag` (`:125`),
  `exit(apply)` (`:167`).
- `src/edit/edit-overlay.ts`: `EditOverlay` (`edit-overlay.ts:25`), `COLORS` /
  `OPACITY` (`:14-23`), `build` (`:54`), `setStates` (`:91`).
- `src/edit/variants-catalog.ts`: `selectionToVariant` (`variants-catalog.ts:47`),
  `variantToSelection` (`:83`), `EDGES` (`:40-45`), `variantGeometry` (`:121`),
  `variantColliders` (`:220`), `FULL_WALL 0x1ff` (`:22`), `FULL_FLOOR 0xf` (`:24`).

Current tunable values:

- `EDIT_REACH 9` units; out-of-reach check at `EDIT_REACH + CELL_SIZE` (13)
  (`edit-controller.ts:25,164`).
- Grid: 3x3 (9 tiles) for walls, 2x2 (4 tiles) for others; these tile counts are
  literals repeated in `edit-grid.ts` (`:28,32`) and `variants-catalog.ts`
  (masks `0x1ff`, `0xf`), not a shared grid.ts-style constant.
- Overlay colors (`edit-overlay.ts:14-23`): idle `0x9fb4c8`, hover `0xffffff`,
  selected `0xff9d2e`; opacity idle `0.22`, hover `0.4`, selected `0.62`;
  `renderOrder 12`; tiles at 90 percent of cell span, offset `0.25` toward viewer.
- Variant id scheme: `wall#<mask>`, `floor#<mask>`, `stairs#w` (narrow),
  `roof#h` (half), `roof#c` (corner); base pieces have no suffix.
- Gameplay flags read here: `confirmEditOnRelease` (default false),
  `resetEditOnRelease` (default false), from `DEFAULT_GAMEPLAY`
  (`src/settings/gameplay.ts:14-18`).

Seams a change would touch: the edit tile indexing must match the variant mask bit
positions; variant ids are the on-the-wire representation stored on each piece and
used by the pool registry key, so changing the mask scheme changes what a stored
variant means. `edit-controller` is the only edit file that reads the persisted
`gameplay` block (read only). The 3x3 and 2x2 tile counts are duplicated across
`edit-grid.ts` and `variants-catalog.ts`.

### 9. Destroy / Mattock and effects

What it does today: while the build mode is `mattock`, holding or pressing primary
fire swings at a fixed cadence. Each swing raycasts a short reach from the aim
ray, hits the nearest build piece, and applies 1 HP of damage via the model. A
destroyed piece is freed immediately (slot, colliders, pool instance) with a
larger spark burst; a non-fatal hit throws a smaller flash; a miss does nothing.
Every attempt drives the player swing animation. `effects.ts` renders all
particles as one additive `THREE.Points` cloud backed by a fixed-capacity ring
buffer, so live particle count is hard-bounded.

Files and key symbols:

- `src/build/destroy-controller.ts`: `MATTOCK_REACH = 9` (`:21`),
  `MATTOCK_INTERVAL = 0.35` (`:22`), `DestroyController` (`:26`), `swing` (`:62`).
- `src/build/effects.ts`: `BreakEffects` (`effects.ts:14`), `CAPACITY 256`
  (`:9`), `GRAVITY 9.0` (`:10`), `burst` (`:55`), `MATERIAL_TINT` (`:127`).

Current tunable values:

- `MATTOCK_REACH 9` units, `MATTOCK_INTERVAL 0.35` s between swings, 1 HP per
  swing (`destroy-controller.ts:21-22`; damage default in `build-model.ts:250`).
  Against `MATERIAL_HP`, wood breaks in 2 swings, stone 3, metal 5.
- Destroy burst 28 particles at speed 4; damaged burst 8 at 2.5
  (`destroy-controller.ts:79,83`).
- Effects: `CAPACITY 256`, `GRAVITY 9.0`, particle size `0.18`, additive
  blending, seed `0x1234_abcd`, lifetime 0.35 to 0.70 s (`effects.ts:9-78`).
  `MATERIAL_TINT` (normalized RGB): wood `[0.85,0.6,0.35]`, stone
  `[0.8,0.82,0.88]`, metal `[0.7,0.85,1.0]` (`effects.ts:128-130`).

Seams a change would touch: the Mattock reads `MATERIAL_HP`, `damageAt`,
`raycastPiece` on the model and `triggerBuildSwing` on the player; a documented
suppressor keeps swings from firing while edit owns primary fire (`main.ts:104`).

### 10. HUD

What it does today: `Hud` builds one DOM overlay once and refreshes it every
frame from a sources interface (mode, active piece, active material, live bind
labels). It renders a mode-dependent crosshair (build, edit, mattock variants,
all present with CSS toggling), a 4-slot build tray in fixed order (Wall, Floor,
Stairs, Roof) with live key labels, a material indicator with an infinity glyph
(unlimited, no numeric count), and a mode chip. All icons are original inline
SVGs. Bind labels refresh on the `input:changed` event.

Files and key symbols:

- `src/hud/hud.ts`: `Hud` (`hud.ts:46`), `PIECES` order (`:32-37`), `MODE_LABEL`
  (`:39-44`), `update` (`:80`), `refreshBindLabels` (`:99`).
- `src/hud/icons.ts`: `ICON_WALL/FLOOR/STAIRS/ROOF/MATTOCK`, `ICON_WOOD/STONE/
  METAL`, `CROSSHAIR_BUILD/EDIT/MATTOCK` (`icons.ts:14-64`).
- `src/style.css`: `#hud` and children (`style.css:43-188`).
- `src/hud/LAYOUT.md`: HUD position reference.

Current tunable values:

- Tray order wall, floor, stairs, roof bound to `buildWall/Floor/Stairs/Roof`
  (`hud.ts:32-37`). Mode labels: movement and mattock both display "Mattock",
  build "Build", edit "Edit" (`hud.ts:39-44`).
- CSS custom properties (`style.css:1-7`): `--hud-bg #12313a`, `--hud-fg
  #e8f4f4`, `--hud-accent #33c4c4`, `--hud-copper #cf7d3c`. Crosshair centered at
  50/50, size `clamp(18px, 2.1vmin, 40px)` (`style.css:54-64`). Tray anchored
  bottom-right via `#hud-corner` (`style.css:77-85`). Mode chip color is accent
  by default, `#ff9d2e` in edit, copper in mattock/movement (`style.css:87-105`).
  Icons are inline SVG `viewBox="0 0 100 100"`, stroke width 6 (`icons.ts`).

Seams a change would touch: all visual sizing/color/position lives in
`src/style.css`, not `hud.ts`; icons are string constants imported by `hud.ts`;
sources are wired in `main.ts:109-115`; the HUD reads bind labels via
`formatBindLabel` and the `input:changed` bus event. `src/hud/LAYOUT.md`
documents positions.

### 11. Minimap

What it does today: `Minimap` owns a 200x200 backing canvas (CSS scales it
responsively) redrawn north-up at about 10 Hz. Each redraw fills the island
backdrop, draws faint grid lines every 4 cells, iterates placed pieces (walls as
short material-colored edge strokes, floor/stairs/roof as filled material-colored
cells), draws a cyan player-facing wedge, and strokes a subtle border. World to
minimap mapping is linear from `ISLAND_SIZE`/`ISLAND_HALF`.

Files and key symbols: `src/hud/minimap.ts`: `Minimap` (`minimap.ts:26`),
`REDRAW_INTERVAL` (`:11`), `SIZE` (`:12`), `MAP_COLOR` (`:14-18`), `redraw`
(`:70`), `toMap` (`:63`), `playerMarker` (`:163`). CSS `#minimap`
(`style.css:405-417`).

Current tunable values: `REDRAW_INTERVAL 0.1` s (10 Hz), `SIZE 200` px.
`MAP_COLOR`: `wood #b07a44`, `stone #9aa0a8`, `metal #7f8ea0` (`minimap.ts:14-18`).
Island backdrop `#16321c`; grid lines every 4 cells `rgba(255,255,255,0.06)`;
player wedge `#33c4c4`; inner border `rgba(51,196,196,0.5)` (`minimap.ts:76-147`).
CSS anchors top-right, size `clamp(120px, 15vmin, 300px)` (`style.css:405-417`).

Seams a change would touch: all island/cell scale is imported from `grid.ts`;
per-material coloring and the wall-vs-cell render branch depend on the `Material`
and `Slot` types; sources are wired in `main.ts:118-125` (piece iteration, player
position, player yaw).

### 12. Lighting and world (island, sky, textures)

What it does today: `World` assembles the outdoor scene into one group: a
procedural gradient sky sphere, hemisphere plus a shadow-casting directional
(sun) light, a flat textured ground plane sized to the island, a cyan wireframe
grid overlay on cell boundaries, a surrounding water ring disc, and a ring of
low-poly instanced hills. Fog matches the sky horizon color. `sky.ts` is a pure
GLSL shader (vertical gradient plus two-lobe sun glow) with no image assets;
`textures.ts` generates the grass texture procedurally on a seeded canvas.

Files and key symbols:

- `src/world/island.ts`: `World` (`island.ts:17`), `buildSky` (`:39`),
  `buildLighting` (`:49`), `buildGround` (`:71`), `buildGridOverlay` (`:87`),
  `buildWaterRing` (`:108`), `buildDistantHills` (`:127`).
- `src/world/sky.ts`: `makeSky` (`sky.ts:41`), `SKY_FRAG` (`:15`).
- `src/world/textures.ts`: `makeGrassTexture` (`textures.ts:30`).

Current tunable values:

- Fog `0xbfe4ec`, near `ISLAND_HALF * 1.4` (112), far `ISLAND_HALF * 4.5` (360)
  (`island.ts:46`).
- Hemisphere light sky `0xdfeffb`, ground `0x3a5233`, intensity `0.9`
  (`island.ts:50`). Directional sun `0xfff2cc`, intensity `2.1`, positioned at
  `sunDirection * 120` (`island.ts:53-54`). Shadow map 2048, frustum
  `-ISLAND_HALF..ISLAND_HALF`, bias `-0.0006`, normalBias `0.04`
  (`island.ts:56-66`).
- Ground `MeshStandardMaterial` roughness `0.95`, metalness 0, grass texture
  repeat `ISLAND_SIZE / (CELL_SIZE * 2)` = 20 (`island.ts:74-79`). Grid overlay
  lifted `y = 0.02`, `LineBasicMaterial` color `0x8fdede`, opacity `0.22`
  (`island.ts:90-102`).
- Water ring `CircleGeometry(ISLAND_HALF * 4, 64)` (radius 320), color `0x2b6f86`,
  opacity `0.92`, at `y = -1.2` (`island.ts:110-122`). Hills `ConeGeometry(1,1,5)`
  flat-shaded color `0x50694a`, 26 instances (`island.ts:129-131`).
- Sky sphere radius `480`, `BackSide`, `depthWrite: false`; `uZenith 0x2f6fb0`,
  `uHorizon 0xbfe4ec`, `uSunColor 0xfff2cc`; sun direction `(0.45,0.75,0.35)`
  normalized; glow `pow(d,64)*0.6 + pow(d,512)*1.4` (`sky.ts:41-56`).
- Grass texture 256 px, seed `0x6f72_7401`, base `#3f7a3a`, 220 blade strokes,
  RepeatWrapping, anisotropy 4 (`textures.ts:30-65`).

Seams a change would touch: the horizon color, fog color, and sun color are
independently declared matching hex values in `island.ts` and `sky.ts` and must
stay coherent by hand. Ground repeat depends on `grid.ts`. The minimap consumes
the same island scale constants, so a grid change moves both in lockstep.

### 13. Input and the action map

What it does today: gameplay code reads named actions only, never raw key codes.
`InputSystem` is the sole DOM-to-gameplay bridge (keyboard and mouse listeners),
exposes `isDown`/`justPressed`/`justReleased` and `consumePointerDelta(context)`,
clears per-frame edges in `lateUpdate`, and gates all capture behind an enabled
flag (disabled until the session enters playing). `Bindings` maps each action to a
code with reject/swap/steal rebinding and conflict detection. Sensitivity is a
pure model with per-context multipliers and a clamped FOV. Every action has a
Fortnite-familiar default bind, all rebindable.

Files and key symbols:

- `src/input/actions.ts`: `ACTIONS` (`actions.ts:5`, 19 actions), `ACTION_META`
  (`:38`), `actionsByCategory` (`:60`).
- `src/input/defaults.ts`: `DEFAULT_BINDINGS` (`defaults.ts:10`),
  `DEFAULT_INPUT_SETTINGS` (`:32`).
- `src/input/bindings.ts`: `Bindings` (`bindings.ts:13`), `rebind` (`:43`),
  `formatBindLabel` (`:92`).
- `src/input/sensitivity.ts`: `FOV_MIN`/`FOV_MAX` (`sensitivity.ts:20-21`),
  `RAD_PER_PIXEL` (`:28`), `contextSensitivity` (`:30`), `scalePointerDelta`
  (`:50`).
- `src/input/input-system.ts`: `InputSystem` (`input-system.ts:25`),
  `consumePointerDelta` (`:82`), `setEnabled` (`:58`), `lateUpdate` (`:117`).

Current tunable values:

- Default binds (`defaults.ts:10-30`): `moveForward KeyW`, `moveBack KeyS`,
  `moveLeft KeyA`, `moveRight KeyD`, `jump Space`, `sprint ShiftLeft`, `crouch
  ControlLeft`, `buildWall KeyZ`, `buildFloor KeyX`, `buildStairs KeyC`,
  `buildRoof KeyV`, `edit KeyG`, `resetEdit KeyT`, `rotate KeyR`, `materialCycle
  KeyF`, `destroyPickaxe Digit1`, `buildCombatToggle KeyB`, `primaryFire Mouse0`,
  `settingsMenu Escape`.
- Sensitivity defaults (`defaults.ts:32-39`): `lookSensitivity 1.0`,
  `targetingSensitivity 0.7`, `buildSensitivityMultiplier 1.0`,
  `editSensitivityMultiplier 1.0`, `invertY false`, `fov 80`. `FOV_MIN 60`,
  `FOV_MAX 120`, `RAD_PER_PIXEL 0.0032`.

Seams a change would touch: adding a control means adding to `ACTIONS`,
`ACTION_META`, `DEFAULT_BINDINGS`, and the persistence coercion. The camera,
movement, build, edit, and destroy controllers all read named actions. Sensitivity
contexts `look`/`targeting`/`build`/`edit` are swapped by the camera rig.

### 14. Settings, session lifecycle, PWA, and persistence

What it does today: `SettingsMenu` is a DOM overlay with three tabs (Input,
Sensitivity, Gameplay) for rebinding, sensitivity and FOV sliders, invert-Y, and
gameplay toggles; changes apply and persist instantly. `SessionController` owns a
title, playing, paused state machine, the title screen, best-effort fullscreen
and pointer lock from the Play click, auto-pause on lost pointer lock or hidden
tab, and the Escape-to-pause path. `persistence.ts` reads and writes one
versioned JSON blob (binds, settings, gameplay) to a single localStorage key,
tolerant to missing or malformed fields via per-field coercion. The service
worker registers only in production builds.

Files and key symbols:

- `src/settings/settings-menu.ts`: `SettingsMenu` (`settings-menu.ts:47`),
  `SLIDERS` (`:33-39`), `GAMEPLAY_TOGGLES` (`:41-45`), `armRebind` (`:104`).
- `src/settings/gameplay.ts`: `GameplaySettings` (`gameplay.ts:5`),
  `DEFAULT_GAMEPLAY` (`:14`).
- `src/pwa/session.ts`: `SessionController` (`session.ts:23`), `play` (`:87`),
  `pause` (`:98`), `resume` (`:107`), `onLockChange` (`:137`).
- `src/pwa/register-sw.ts`: `registerServiceWorker` (`register-sw.ts:4`).
- `src/input/persistence.ts`: `STORAGE_KEY` (`persistence.ts:11`),
  `CURRENT_VERSION` (`:12`), `PersistedInput` (`:14`), `migrate` (`:70`),
  `loadInput` (`:91`), `saveGameplay` (`:111`).

Current tunable values:

- Persistence: `STORAGE_KEY = "fort.input"`, `CURRENT_VERSION = 2`
  (`persistence.ts:11-12`; version 2 added the gameplay block). `migrate` reads
  `parsed.version` but does not branch on it today (`void version`,
  `persistence.ts:73`); it re-stamps every load to `CURRENT_VERSION` and coerces
  each slice field by field, so a v1 payload without a gameplay block loads with
  defaults.
- Gameplay defaults (`gameplay.ts:14-18`): `turboBuild true`,
  `confirmEditOnRelease false`, `resetEditOnRelease false`.
- Settings slider ranges (`settings-menu.ts:33-39`): look/targeting 0.1 to 3 step
  0.05; build/edit 0.2 to 2 step 0.05; FOV `FOV_MIN` to `FOV_MAX` step 1.
- Session states `title`, `playing`, `paused`; title copy "Fort" /
  "Creative Freebuild Sandbox" / "Play" / "Install" (`session.ts:34-43`).

Seams a change would touch: a `CURRENT_VERSION` bump or `GameplaySettings` shape
change touches `persistence.ts`, `settings-menu.ts` (which imports `saveGameplay`
directly), `gameplay.ts`, and every runtime reader of the gameplay block
(`build-controller.ts`, `edit-controller.ts`). The session drives input enable
and settings open/close and wires `onPause` to cancel transient build/edit state
(`main.ts:141-145`).

## Cross-cutting invariants to preserve

These are Fort's existing hard rules, restated here because every later phase must
respect them (they are described as constraints, not proposals):

- Everything stays testable headlessly through `game.stepForTest()` and
  `window.__fort.debug.pump(frames)`. Performance claims use the deterministic
  proxies on `debug.perf` and `debug.build` (`drawCalls`, `colliderCount`,
  `nearComparisons`, `poolGrows`), never wall-clock fps (the reference
  environment renders through software WebGL).
- All gameplay input flows through the action map (`src/input/actions.ts`); new
  controls are added as actions with rebindable defaults
  (`src/input/defaults.ts`) and persist through the versioned schema
  (`src/input/persistence.ts`). No hardcoded keys.
- `src/world/grid.ts` is the single source of truth for the lattice; nothing else
  hardcodes cell dimensions.
- No em dashes (U+2014) anywhere; `npm run check` enforces it.
- Placed pieces render through InstancedMesh pools (one pool per variant plus
  material), grown by capacity doubling and shrunk by swap-remove
  (`src/build/instance-pool.ts`, `INITIAL_CAPACITY 256`).

## High-blast-radius coupling (for later phases to weigh)

Description of the code's existing coupling, so Phase 3 and Phase 4 can flag these
deliberately:

- Grid scale (`src/world/grid.ts` `CELL_SIZE`, `CELL_HEIGHT`): a change ripples
  through placement, collision, targeting, edit grids, world ground/overlay, and
  the minimap. Highest blast radius in the tree.
- Persistence schema version (`src/input/persistence.ts` `CURRENT_VERSION = 2`):
  any change to the persisted binds, settings, or gameplay shape needs a
  migration and a bump; today `migrate` does no version branching.
- `GameplaySettings` shape (`src/settings/gameplay.ts`): shared across
  persistence, the settings menu, the build controller, and the edit controller.
- Shared thickness and step constants (`WALL_THICK`, `FLOOR_THICK`, `STAIR_STEPS`
  in `src/build/colliders.ts`): imported by both visual geometry and physical
  colliders, so they move together by design.
- Edit tile counts (3x3 / 2x2): duplicated as literals across `edit-grid.ts` and
  `variants-catalog.ts` rather than a single shared constant.
- Independent-but-matching look constants: fog color (`island.ts`), sky horizon
  (`sky.ts`), and sun color are separate hex literals kept coherent by hand.

## "Before" evidence captured

All images live in `test-results/evidence/`. They were produced by two Playwright
specs driven entirely through `window.__fort.debug` (headless, software WebGL via
swiftshader). Nine are the canonical set from the existing `tests/verify.spec.ts`
(`npm run test:verify`); six are new angles captured by a single read-only spec
added for this audit, `tests/before-evidence.spec.ts`, which changes no `src/`
behavior and asserts nothing.

Note on capture: the repo `playwright.config.ts` webServer probes
`http://127.0.0.1:4173`, but on this macOS host `vite preview` binds localhost to
IPv6 `::1`, so the IPv4 probe times out. The evidence here was captured with an
unversioned throwaway config that forces `vite preview --host 127.0.0.1`; the
screenshots are identical to what the canonical run produces on Linux CI. This is
an environment note only; no repo test config was changed.

Canonical set (`tests/verify.spec.ts`, viewport noted):

| Image | What it shows |
|---|---|
| `t21-flow-1-place.png` | A single wall placed on open ground (build mode), 1280x720. |
| `t21-flow-2-edit.png` | Edit mode on that wall with the center tile selected (window), 1280x720. |
| `t21-flow-3-destroy.png` | The slot after the piece is destroyed by the Mattock, 1280x720. |
| `t21-ghost-blue.png` | Valid placement ghost (blue `0x2f7fff`), clipped to the crosshair region. |
| `t21-ghost-red.png` | Invalid placement ghost (red `0xff3b30`) over an occupied slot, clipped. |
| `t21-hud-build.png` | HUD in build mode with the stairs tray slot active, 1920x1080. |
| `t21-hud-edit.png` | HUD in edit mode (edit crosshair) over a wall, 1920x1080. |
| `t21-minimap.png` | Minimap clip showing a small structure and the player wedge. |
| `t21-materials.png` | Wood, stone, and metal walls side by side (material read). |

New angles (`tests/before-evidence.spec.ts`, all 1280x720):

| Image | What it shows |
|---|---|
| `before-third-person-idle.png` | Clean third-person idle: the hero on the grass grid, sky gradient, distant hills, full HUD (minimap, build tray, Mattock mode chip). |
| `before-player-proportions.png` | The hero standing on a wood floor in front of a wood wall, so hero height (about 1.8) reads against wall height (3.0) and cell width (4.0). |
| `before-grid-open-ground.png` | The cyan build grid lattice on empty ground with a translucent blue floor ghost; BUILD mode chip and floor tray slot active. |
| `before-stair-run.png` | A four-high self-supporting wood stair stack, side-on, showing the stepped tread geometry and stair silhouette. |
| `before-fort-structure.png` | A closed 1x1 hut: four stone walls, a wood floor, and a metal roof, showing the canonical build silhouette and multi-material read. |
| `before-island-wide.png` | Wide establishing shot: the grid ground receding to the water ring, the ring of low-poly hills, and the sky gradient with sun glow (world framing and lighting mood). |

Total: 15 "before" images.

## Deliverable status

- `docs/audit.md` (this file): complete.
- `test-results/evidence/`: 15 "before" images captured and listed above.
- One new read-only evidence spec added: `tests/before-evidence.spec.ts`.
- No file under `src/` was changed in Phase 0.
- Next phase (not started): Phase 1 research into real Fortnite values, to be
  written to `docs/research.md`.
