# Fort to Fortnite Parity: Research, Design, and Plan Brief

## What this task is

Bring Fort as close as possible to real Fortnite Battle Royale creative and
freebuild feel and look, working entirely within Fort's existing architecture.

This is a **research plus design plus plan** task. You will produce an audit, a
sourced research dossier, a gap analysis, a design document, and a ticketed
implementation plan, and then you will **STOP for human review**. Do not write
any feature code, and do not modify any file under `src/` in this run. The only
files you create are the documents this brief asks for and, if needed, one new
read-only Playwright evidence spec used purely to capture "before" screenshots.

Read this whole brief before starting. Work the phases in order, **one phase per
run**: after each phase, stop and let a human review that phase's artifact before
starting the next (see "Execution: phase by phase" below). Each phase ends with a
concrete artifact committed to `docs/`.

---

## Locked decisions (non-negotiable)

1. **Mechanics and feel come first, visuals second.** Prioritize movement,
   build and edit timing, the grid, targeting, and camera before any graphics
   work. When you rank and sequence changes, "feels identical to Fortnite" is
   the top sort key, and every mechanics change is sequenced ahead of every
   pure-visual change.

2. **Every asset is authored or generated in-repo. No Epic Games files of any
   kind.** No Epic textures, models, meshes, audio, fonts, logos, UI art,
   icons, or character likenesses may enter the repository. Match the look by
   reimplementing it originally (procedural textures, code-built geometry,
   hand-authored clips), never by importing or tracing Epic assets. The hero
   stays the blank / original skin defined in `src/character/` (see
   `src/character/DESIGN.md`). Fort already follows this rule; keep it.

3. **Formal trade-dress and legal review is a separate deferred pass and is out
   of scope here.** Do not attempt a legal analysis. Flag anything that looks
   legally sensitive for that later pass and move on.

4. **Shape: research, then design, then plan, then STOP.** No feature code until
   a human approves the plan. The deliverable of this task is the set of
   documents plus a plan awaiting approval, not a working change.

5. **Web access is available for research.** Use it freely, but frame all
   reference-gathering as "observe in order to reimplement originally." Never
   copy, download, embed, trace, or transcribe Epic assets. Capture numbers,
   ratios, timings, proportions, and behavior descriptions in your own words
   with sources. Screenshots you take of Fortnite are research notes for
   yourself only; they never become repo assets and are never checked in.

---

## Hard project rules to preserve (these carry into every proposed change)

These are Fort's existing invariants. Every design proposal and every planned
ticket must respect them, and you should restate them inside the design doc and
the plan so the implementing session cannot miss them.

- **Everything stays testable headlessly.** Drive the game deterministically
  through `game.stepForTest()` and the `window.__fort.debug.pump(frames)` hook
  (see `src/core/game.ts` and the debug surface wired in `src/main.ts`). Never
  assert on wall-clock frame rate; the reference environment renders through
  software WebGL (swiftshader), so real fps is meaningless. For performance
  claims use deterministic proxies already exposed on `window.__fort.debug`
  (for example `debug.build.drawCalls()`, `debug.build.colliderCount()`,
  `debug.perf.nearComparisons()`, `debug.perf.poolGrows()`), never a timed fps
  measurement.
- **All gameplay input flows through the action map.** Gameplay code reads named
  actions from `src/input/actions.ts` only, never raw key codes. Any new control
  must be added as an action with a rebindable default in
  `src/input/defaults.ts`, and it must persist through the versioned schema in
  `src/input/persistence.ts`. No hardcoded keys anywhere.
- **`src/world/grid.ts` is the single source of truth for the build lattice.**
  `CELL_SIZE`, `CELL_HEIGHT`, `ISLAND_CELLS`, and the cell/world helpers live
  there and nothing else may hardcode those numbers. Any change to grid scale is
  high-blast-radius and must be called out explicitly (see the flag rule in
  Phase 3).
- **No em dashes anywhere.** The character U+2014 is banned in all source,
  comments, UI strings, and docs, and `npm run check` fails the build if one
  appears (`scripts/check-no-emdash.mjs`). This brief and every document you
  write must use plain hyphens. Run `npm run check` before you consider any
  document done.

---

## Repository orientation (verified file map)

Fort is Vite + TypeScript + vanilla Three.js, a single WebGL2 scene, single
player, desktop only, shipped as an installable fullscreen PWA. The System
interface plus fixed-timestep loop lives in `src/core/`. Here is where each
Fortnite-relevant system actually lives, so your Phase 0 inventory can cite real
files:

- **Engine and loop:** `src/core/game.ts` (the `System` interface, the `Game`
  object, `stepForTest`), `src/core/time.ts` (`FixedStepper`, 120 Hz sim),
  `src/core/events.ts`, `src/core/debug-overlay.ts`.
- **Debug and test harness:** `src/main.ts` builds the `window.__fort.debug`
  surface (`pump`, `teleport`, `setYaw`, `setPitch`, `build.*`, `target.*`,
  `edit.*`, `hud.*`, `session.*`, `destroy.*`, `perf.*`, `minimap.*`) and sets
  `window.__fortReady`.
- **Input and action map:** `src/input/actions.ts` (the `ACTIONS` list and
  metadata), `src/input/defaults.ts` (Fortnite-familiar default binds and
  `fov`), `src/input/bindings.ts`, `src/input/sensitivity.ts` (per-context
  sensitivity), `src/input/persistence.ts` (`CURRENT_VERSION`, migration),
  `src/input/input-system.ts`.
- **Movement:** `src/player/movement.ts`, `src/player/movement-tuning.ts` (the
  `MOVE` table and `jumpApex` / `jumpAirtime` derivations),
  `src/player/collision.ts` (swept capsule vs. AABB), `src/player/player.ts`,
  `src/player/player-state.ts`.
- **Camera:** `src/player/camera-rig.ts` (third-person over-the-shoulder rig,
  aim ray).
- **Character and skin:** `src/character/hero.ts`, `skeleton-def.ts`,
  `clips.ts`, `animation-controller.ts`, `textures.ts`, `turntable.ts`, and
  `src/character/DESIGN.md` (originality record, palette, the Mattock tool).
- **Build grid and pieces:** `src/world/grid.ts` (single source of truth),
  `src/build/build-model.ts`, `piece.ts`, `slots.ts`, `variants.ts`,
  `colliders.ts`, `rules.ts` (bounds, occupancy, `isSupported`, `BUILD_MAX_LEVEL`).
- **Placement, ghost, turbo, materials:** `src/build/targeting.ts`,
  `ghost.ts`, `build-controller.ts`, `build-system.ts`, `instance-pool.ts`
  (InstancedMesh pools), `materials.ts` (procedural wood / stone / metal).
- **Edit mode:** `src/edit/edit-grid.ts` (3x3 wall, 2x2 floor/stairs/roof
  face grids, hit-testing), `edit-controller.ts`, `edit-overlay.ts`,
  `variants-catalog.ts` (selection-mask to shape mapping).
- **Destroy / Mattock:** `src/build/destroy-controller.ts`, `effects.ts`.
- **HUD and minimap:** `src/hud/hud.ts`, `src/hud/icons.ts`,
  `src/hud/LAYOUT.md` (crosshair, tray, material, mode chip), `src/hud/minimap.ts`.
- **World and lighting:** `src/world/island.ts`, `sky.ts`, `textures.ts`.
- **Settings and lifecycle:** `src/settings/settings-menu.ts`,
  `src/settings/gameplay.ts`, `src/pwa/session.ts`, `src/pwa/register-sw.ts`.
- **Tests and evidence:** `tests/*.spec.ts` (per-system Playwright specs),
  `tests/verify.spec.ts` (the consolidated canonical run), `playwright.config.ts`.

### Commands

- `npm ci` then `npm run check` (typecheck + ESLint at zero warnings + the
  no-em-dash scan). This is the fast gate; run it after writing docs.
- `npm run test:unit` runs the Vitest suites (pure logic, node).
- `npm run test:verify` runs `tests/verify.spec.ts`, the sub-5-minute canonical
  Playwright run that writes screenshots to `test-results/evidence/`.
- `npm run test` runs the full Playwright suite (slower; do not run it casually).
- `npm run dev` / `npm run build` / `npm run preview` for the app itself.

### Baseline movement and grid values already shipped (for reference in Phase 2)

From `src/player/movement-tuning.ts` (`MOVE`): runSpeed 5.5, sprintSpeed 6.6,
crouchSpeed 2.8, groundAccel 60, groundDecel 55, airAccel 45, airMaxSpeed 6.6,
jumpSpeed 6.8, riseGravity 15.41, fallGravity 26.0, maxFallSpeed 40, coyoteTime
0.06, jumpBuffer 0.08, stepHeight 0.6, jumpApexTarget 1.5. From
`src/world/grid.ts`: CELL_SIZE 4, CELL_HEIGHT 3 (a 4:4:3 footprint-to-height
ratio chosen to mirror Fortnite's roughly 512:512:384 build units), ISLAND_CELLS
40. From `src/build/rules.ts`: BUILD_MAX_LEVEL 40. From `src/input/defaults.ts`:
default fov 80. Treat these as the "Fort does Y" column; your job in Phase 1 is
to find the real Fortnite "X" they should be measured against.

---

## Skills available in this session, and how to invoke them

Each of these is invoked by typing its slash name (for example `/deep-research`)
or by calling the Skill tool with the bare skill name. The design and plan
review skills are interactive. Use the exact names below.

**Research and web:**
- `/deep-research` (native harness): fan-out web searches, fetch sources,
  adversarially verify claims, and synthesize a cited report. This is the
  primary tool for Phase 1.
- `/browse` (gstack): fast headless browser for looking at live pages. Per this
  environment's global rule, `/browse` is the required way to browse the web;
  do not use any `mcp__claude-in-chrome__*` tools.
- `/scrape` (gstack): pull structured data off a specific page when you need it.
- `context7` MCP (`resolve-library-id` then `query-docs`): current docs for any
  library or API (Three.js, Vite, Playwright) if an implementation detail comes
  up during design.
- `WebSearch` / `WebFetch` are also available as a fallback to `/deep-research`.

**Design:**
- `/design-consultation` (gstack): the design skill for Phase 3. It understands
  the product, researches the landscape, and proposes a complete design system.
  Use it to structure the visual-parity design work and the original-asset
  approach per change.
- `/design-review` (gstack): a designer's-eye QA pass. Useful later against
  "before" evidence to name specific visual gaps precisely; not required for the
  plan itself.
- `/plan-design-review` (gstack): designer's-eye review of a plan or design doc,
  interactive. Optional pressure-test of the Phase 3 output.

**Planning:**
- **Native plan mode** (the harness EnterPlanMode / ExitPlanMode flow): use this
  to assemble and present the Phase 4 implementation plan. Presenting the plan
  for approval through plan mode is the STOP gate for this task.
- `/spec` (gstack): turns vague intent into a precise, executable five-phase
  spec. Optional aid for shaping individual tickets crisply.
- `/plan-eng-review` (gstack): eng-manager-mode review of the plan, interactive.
  Recommended to pressure-test sequencing, acceptance criteria, and risk before
  you present for human approval.
- `/plan-ceo-review`, `/plan-devex-review` (gstack): additional plan-review
  lenses if you want them; not required.

**Note on `/goal` and `/loop`:** these are native Claude Code build-and-verify
loops, not gstack skills, and they EXECUTE work autonomously. Do not invoke
either one in this task. They belong to the later implementation run, only after
a human approves the plan.

---

## Execution: phase by phase, with the right model per phase

Run one phase at a time. After each phase, stop and let a human review that
phase's artifact before starting the next. Do not run Phases 0 through 4 in a
single pass. Each phase is its own checkpoint, so a wrong turn is caught early
and cheaply.

Pick the model at the start of each phase (the app's model picker, or `/model`
in a terminal session). If a single session drives a phase through subagents,
spawn that phase's agent with the chosen model.

| Phase | Model | Why |
|-------|-------|-----|
| 0 Audit | Opus 4.8 | Accurate reading and file citation. Haiku is acceptable for the bulk reading if you want to save budget. |
| 1 Research | Opus 4.8 | The numbers must be right and adversarially corroborated. Do not use Fable here. |
| 2 Gap analysis | Opus 4.8 | Correctness-critical deltas and the feels-identical ranking. |
| 3 Design and styling | Fable 5 | The creative visual-direction phase: art direction, palette, material feel, silhouette, and the original-asset approach per change. This is where Fable is worth trying. Keep the hard-rules checklist and the per-change test and evidence plan honest; a quick `/plan-design-review` or Opus pass can sanity-check the architecture fit. |
| 4 Plan | Opus 4.8 | Sequencing, acceptance criteria, and test mapping. |

For the later implementation run (Run B, after the plan is approved), carry the
same split ticket by ticket: build mechanics and correctness-critical tickets on
Opus 4.8, and build the visual and styling tickets on Fable 5. Phase 4 tags each
ticket with its model so that run is unambiguous.

---

## The phases

### Phase 0: Audit the current game

Goal: a file-cited inventory of every Fortnite-relevant system as it exists
today, plus a "before" screenshot set.

Do:
1. Read the relevant source (use the file map above as your checklist) and
   produce `docs/audit.md`. For each system (character and skin, movement,
   camera, build pieces, placement / ghost / turbo, edit mode, destroy /
   Mattock, HUD, minimap, materials, lighting and world), record: what it does
   today, the exact files and key symbols that implement it, the current tunable
   values where they exist, and the seams a change would touch. Cite files as
   paths (and line numbers where helpful). This is description only, no
   judgement yet; the deltas come in Phase 2.
2. Capture "before" screenshots through the existing Playwright evidence
   harness. Prefer `npm run test:verify`, which already writes a canonical set
   (HUD build and edit states, ghost colors, minimap, materials, the full place
   to edit to destroy flow) to `test-results/evidence/`. If you need angles it
   does not cover (for example a clean third-person idle, the build grid on open
   ground, a stair run), add ONE new read-only spec under `tests/` that only
   drives `window.__fort.debug` and calls `page.screenshot({ path: ... })` into
   `test-results/evidence/`; it must not change any `src/` behavior. List every
   "before" image and what it shows in `docs/audit.md`.

Deliverable: `docs/audit.md` plus the referenced images in
`test-results/evidence/`.

### Phase 1: Research real Fortnite (sourced specifics)

Goal: a research dossier of concrete, sourced Fortnite facts, in your own words,
never copied assets.

Use `/deep-research` as the driver and `/browse` for any live-page viewing.
Frame every query as observe-to-reimplement. Gather numbers, ratios, timings,
and proportions with a source for each, across all of these areas:

- **Look and graphics:** art direction, lighting mood, color and saturation,
  material read, silhouette and outline treatment, sky and world framing, the
  overall "readable stylized" quality. Description and reference values, not
  assets.
- **Build-piece grid:** real build-piece footprint and height, the
  footprint-to-height ratio, how pieces snap to the grid and to each other, wall
  / floor / stair / cone (roof) placement rules, and the structural-support
  rules (what can hang off what, ground support, build height behavior).
- **Player proportions and motion feel:** character height relative to a wall
  and floor, camera height, how big the player reads against one build cell, and
  the general weight and responsiveness of motion.
- **Movement values:** run speed, sprint behavior and multiplier, crouch speed,
  ground acceleration and stopping, air control and air speed cap, jump height
  and airtime, gravity feel on rise versus fall, and terminal fall behavior.
  Convert to Fort's units where you can (roughly 1 unit is 1 meter, cell 4 units
  wide and 3 tall) so Phase 2 can compare directly.
- **Placement, ghost, and turbo cadence:** how fast a held build places pieces
  (turbo build rate), the ghost preview behavior and its valid / invalid color
  language, wall-versus-floor-versus-stair targeting, and the rhythm of rapid
  building.
- **Edit grid and gesture:** the edit selection grid per piece (wall, floor,
  stairs, roof), the click-and-drag select gesture, reset behavior, confirm on
  release, and the canonical edit shapes players make (window, door, half wall,
  cone corners, stair re-facing, floor hole).
- **Gameplay loop and HUD:** the freebuild loop (move, target, build, edit,
  destroy, cycle material, swap piece), and the HUD information hierarchy and
  screen positions (crosshair variants, build tray order, material and quantity
  indicator, mode indicator, minimap placement).

Have `/deep-research` adversarially verify the load-bearing numbers (do not
trust a single hobbyist source for a movement value; corroborate). Record
everything, with sources, in `docs/research.md`. Note confidence per fact.

Deliverable: `docs/research.md` (sourced, in your own words, zero embedded
assets).

### Phase 2: Gap analysis

Goal: a ranked delta table that turns research into an ordered work list.

For every meaningful item, write one row: **Fortnite does X (source) / Fort does
Y (file) / delta / why it matters / effort.** Pull "X" from `docs/research.md`
with its source, and "Y" from `docs/audit.md` with its file. Be specific with
numbers (for example "Fortnite wall height about H, Fort CELL_HEIGHT 3 in
`src/world/grid.ts`, delta Z percent").

Rank the whole list by how much closing the gap makes Fort **feel identical** to
Fortnite, and within that ordering keep every mechanics item ahead of every
pure-visual item (locked decision 1). Mark each row mechanics or visual, and
give a rough effort size.

Deliverable: `docs/gap-analysis.md`.

### Phase 3: Design document

Goal: a design doc that proposes concrete changes fitting Fort's existing
architecture, with an original-asset approach for every visual change and a test
plus evidence plan per change.

Run this phase on **Fable 5** (see the model table above): it is the creative
visual-direction phase and Fable's strength. Use `/design-consultation` (the
design skill) to drive it, and `/design-shotgun` if you want multiple aesthetic
variants to compare. Optionally pressure-test the result with
`/plan-design-review`. The doc must:

- Propose each change as a fit to the current architecture (name the systems and
  files it touches; respect the System interface, the action map, the
  InstancedMesh pooling model, and grid.ts as the single source of truth).
- For every visual change, spell out the **original-asset approach**: exactly how
  the look is reproduced in-repo (procedural texture, code-built geometry,
  hand-authored animation clip, DOM/CSS HUD art), reaffirming that no Epic asset
  is used and the hero stays the blank / original skin.
- Give a **test and evidence plan per change**: the headless assertion that
  proves the mechanic (via `stepForTest` / `debug.pump` and deterministic
  proxies, never wall-clock fps) and the "after" screenshot that will sit beside
  the Phase 0 "before" image.
- **Flag, in a dedicated section, anything that touches `src/world/grid.ts` or
  the persistence schema version in `src/input/persistence.ts`.** Grid scale is
  the single source of truth and a change there ripples through placement,
  collision, targeting, edit grids, and the minimap; a persistence bump needs a
  migration. Call these out loudly as high-blast-radius so a human weighs them
  deliberately.

Sequence the doc mechanics-first, visuals-second, matching the gap analysis
ranking.

Deliverable: `docs/design.md`.

### Phase 4: Implementation plan (then STOP)

Goal: an ordered, ticket-style plan of small, independently verifiable steps
that a later session can execute one at a time.

Assemble this in **native plan mode** and present it through plan mode for human
approval; that presentation IS the stop gate. Recommended: run
`/plan-eng-review` first to pressure-test sequencing and acceptance criteria,
and optionally use `/spec` to sharpen individual tickets.

The plan must:

- Be a numbered sequence of tickets in the project's existing style (T22, T23,
  ... continuing from the shipped T01 to T21 in `TICKETS.md`), each small enough
  to verify on its own.
- Sequence **mechanics first, then visuals**, following the Phase 2 ranking, so
  feel converges before the look does.
- Give every ticket explicit **acceptance criteria** and **the exact tests that
  prove it** (Vitest for pure logic, a Playwright spec driven through
  `window.__fort.debug` for in-scene behavior, plus the evidence screenshot).
  Restate the headless-testability, action-map, grid.ts, and no-em-dash rules in
  the ticket where they apply.
- Mark any feel-gated ticket (movement, jump arc, camera, animation) that should
  stop for human approval, mirroring how `TICKETS.md` batches feel-gated work.
- **Tag each ticket with its recommended model:** mechanics and
  correctness-critical tickets on Opus 4.8, visual and styling tickets on
  Fable 5, matching the per-phase model table. This makes Run B build the look
  on Fable and the feel on Opus without further guesswork.
- Carry forward the Phase 3 flags for grid.ts and persistence versioning as
  their own clearly marked tickets or preconditions.

Deliverable: the plan presented in plan mode for approval, and written to
`docs/parity-plan.md` for the record.

**Then STOP.** Do not begin any ticket. Do not write feature code. Do not touch
`src/`. The task is complete when the five documents exist
(`docs/audit.md`, `docs/research.md`, `docs/gap-analysis.md`, `docs/design.md`,
`docs/parity-plan.md`), the "before" evidence is captured, `npm run check`
passes, and the plan is awaiting human review.

---

## Definition of done for THIS task

- `docs/audit.md`, `docs/research.md`, `docs/gap-analysis.md`, `docs/design.md`,
  and `docs/parity-plan.md` all exist and are internally consistent (the gap
  analysis cites the audit and research; the design and plan follow the ranking).
- "Before" screenshots are captured under `test-results/evidence/` and listed in
  the audit.
- No file under `src/` was changed. At most one new read-only evidence spec was
  added under `tests/`.
- No Epic Games asset entered the repo; all proposed assets are original and
  generated in-repo; the hero stays the blank / original skin.
- Mechanics and feel are prioritized and sequenced ahead of visuals throughout.
- The headless-testability, action-map, single-source-of-truth grid, and
  no-em-dash rules are preserved and restated in the design and plan.
- `npm run check` passes on the new docs (zero em dashes).
- The implementation plan is presented for human approval and nothing is built
  yet.
