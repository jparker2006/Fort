# Fort Phase 1 Research: Real Fortnite Reference Dossier

Status: Phase 1 of the Fortnite parity brief (`docs/fortnite-parity-brief.md`).
This is a sourced dossier of concrete Fortnite Battle Royale build, movement, and
look facts, gathered to reimplement the feel and look originally in Fort's engine.
Everything here is described in my own words with sources; no Epic asset was
copied, embedded, traced, or transcribed. Only numbers, ratios, timings,
proportions, and behavior descriptions are recorded.

The deltas against Fort (the "Fort does Y" column and the ranked work list) are
Phase 2 (`docs/gap-analysis.md`), not here. This document is the "Fortnite does
X" column with sources and confidence.

## Method and how to read this

Primary gathering ran through the `/deep-research` workflow (6 search angles, 25
fetched sources, 102 extracted claims, a 3-vote adversarial verification pass).
That run hit a session usage limit partway through the verification and synthesis
steps, so 15 claims completed a full 3-0 or 2-0 adversarial pass (mostly the
build-dimension and unit facts from Epic's own developer documentation), while
several other well-sourced claims (turbo cadence, edit grids, material HP,
keybinds) lost their verification votes to the limit rather than to any
refutation. Those are carried here at medium or low confidence and flagged. A
small set of targeted follow-up fetches filled the remaining gaps
(movement, materials). Fandom and some guide sites block automated fetch (HTTP
402 / 403), so a few community facts are cited from search-surfaced summaries
rather than a full-page fetch.

Confidence scale used per fact:

- high: a primary Epic or Unreal Engine source, or direct arithmetic from one.
- medium: a reputable secondary source, or a single-source primary not
  cross-verified in this run.
- low: a community estimate that is not officially published; treat as a starting
  hypothesis to confirm by in-game measurement.

Era note: Fortnite has changed a lot across chapters and seasons (sprint,
mantling, movement reworks, material HP retunes). Long-stable facts (build-piece
dimensions, the 512-unit grid, player height) are marked as such; era-specific
facts carry their patch or chapter.

Unit convention: Fortnite uses Unreal units where 1 uu = 1 cm and 1 m = 100 uu
[E2][E3]. Fort uses roughly 1 unit = 1 meter, with one build cell 4 units wide
and 3 units tall. Where useful, Fortnite dimensions are given in uu, meters, and
"in Fort-cell terms."

## Source ledger

| ID | Source | Tier |
|---|---|---|
| E1 | Epic: Architectural Modeling Guidelines in UEFN (dev.epicgames.com/documentation/fortnite/architectural-modeling-guidelines-in-unreal-editor-for-fortnite) | primary |
| E2 | Epic: Unreal Units (dev.epicgames.com/documentation/fortnite/unreal-units) | primary |
| E3 | Epic: Fortnite-Ready Assets Best Practices (dev.epicgames.com/documentation/fortnite/fortniteready-assets-best-practices-in-fortnite) | primary |
| E4 | Epic: Sprint glossary entry (dev.epicgames.com/documentation/en-us/fortnite/sprint) | primary |
| E5 | Unreal Engine tech blog: Lumen in Fortnite BR Chapter 4 (unrealengine.com/en-US/tech-blog/lumen-brings-real-time-global-illumination-to-fortnite-battle-royale-chapter-4) | primary |
| E6 | GDC 2018: "Developing the Art of Fortnite," Peter Ellis, Epic (gdcvault.com/play/1024936) | primary talk |
| E7 | Epic/UE: Third-Person Template (dev.epicgames.com/documentation/en-us/unreal-engine/third-person-template-in-unreal-engine) | primary (engine) |
| E8 | UE Character Movement defaults + forums (JumpZVelocity, Gravity Z, MaxWalkSpeed) | primary/forum (engine) |
| F1 | Fortnite Wiki (Fandom): Building | secondary |
| F2 | Fortnite Wiki (Fandom): Movement | secondary |
| F3 | Fortnite Wiki (Fandom): Materials (Battle Royale) | secondary |
| D1 | Dot Esports: v10.20 turbo-build nerf | secondary |
| G1 | GameRevolution: patch 5.10 building/material/pickaxe changes | secondary |
| M1 | GameRant / Kr4m / some-stuff: current material HP summaries | secondary/blog |
| B1 | Habrador: stylized graphics of Fortnite and Sea of Thieves | blog |
| B2 | PSU: "The secret genius of Fortnite's art style" | blog |
| K1 | PwrDown: default Fortnite PC controls | blog |
| K2 | OnlineGameCommands: default PC Fortnite keybinds | blog |

## Area 1: Look and graphics

- Art direction is deliberately "readable stylized," not photoreal and not
  cel-shaded: bright, saturated, colorful, with hand-crafted, slightly
  exaggerated proportions and clean color separation so shapes read instantly at
  gameplay distance. This was an explicit design pivot away from an earlier drab
  and monotone environment toward high color and readability. Source: E6 (Epic
  art lead's GDC talk), corroborated by B1, B2. Confidence: high on the
  direction, medium on specifics.
- Rendering is physically based (PBR) but stylized: materials are lit with real
  PBR response yet authored with low grunge and strong, simple albedo so wood,
  stone, and metal read as distinct at a glance. Source: B1, B2. Confidence:
  medium.
- No hard black outline or ink line is used. Silhouette readability comes from
  shape design, color contrast, and lighting rather than a toon outline pass.
  Source: B1, B2 (described as stylized-PBR, not cel/outline). Confidence: medium.
  Note: Fort likewise ships no outline pass, so this matches Fort's current look.
- Lighting mood is a bright, high-key daytime feel with soft global illumination
  and a dynamic time of day. From Chapter 4 onward the game uses Unreal Engine 5
  Lumen for fully dynamic, real-time global illumination and reflections that
  react to lighting changes live. Source: E5 (Unreal tech blog). Confidence: high
  for Chapter 4+; earlier chapters used baked or simpler dynamic lighting
  (era-specific).
- Sky and world framing: bright skies, long draw distance, and colorful,
  clearly-themed biomes support aerial readability (the game is read from the
  air on the bus drop and from build height). Source: E6, B2. Confidence: medium.
- Overall the "readable stylized" quality is the load-bearing look goal: every
  material and silhouette is tuned so a player can parse the scene fast.
  Confidence: high (this is the stated design intent, E6).

## Area 2: Build-piece grid and dimensions

This is the strongest-sourced area; the core dimensions come straight from Epic's
own developer documentation and passed a 3-0 adversarial check.

- Unit basis: 1 uu = 1 cm; 1 m = 100 uu; the build grid is measured in uu, and one
  grid tile is 512 uu. Source: E2, E3. Confidence: high.
- The canonical world/build grid size is 512 cm (512 uu = 5.12 m), described by
  Epic as "the standard used for Fortnite." Source: E3. Confidence: high.

Piece dimensions (Epic architectural guidelines, E1; cross-checked E3):

| Piece | Footprint (uu) | Height (uu) | Footprint (m) | Height (m) | Notes |
|---|---|---|---|---|---|
| Wall | 512 wide | 384 | 5.12 | 3.84 | 24 uu thick (12 each side). Width:height = 4:3. |
| Floor / ceiling | 512 x 512 | 24 thick | 5.12 x 5.12 | 0.24 | Square footprint matches the wall width on both axes. |
| Stairs (ramp) | 512 x 512 | 384 rise | 5.12 x 5.12 | 3.84 | Spans one cell horizontally and one wall vertically. |
| Cone / roof (pyramid) | 512 x 512 | ~192 peak | 5.12 x 5.12 | ~1.92 | Peak is about half a wall height. See note below. |

- Wall footprint-to-height ratio is exactly 512:384 = 4:3. Source: E1. Confidence:
  high. (Fort's cell is 4 wide by 3 tall, the same 4:3 ratio, at a smaller
  absolute scale; the audit records Fort CELL_SIZE 4, CELL_HEIGHT 3.)
- Cone/roof height: a claim that the cone rises the full 384 uu was refuted in the
  adversarial pass (1-2), and a secondary source gives the cone peak at 192 uu
  (1.92 m), i.e. about half a wall. Source: E1 (refutation), F1 (192 uu peak).
  Confidence: medium. This matters because the roof is the one core piece that is
  not a full 384 tall.
- All four core pieces share the same 512 x 512 uu cell footprint, so walls,
  floors, ramps, and cones tile one modular grid. Source: E1. Confidence: high.
- Grid and snapping: each structure occupies a 1 x 1 x 1 cell on the build grid;
  walls sit on the cell boundaries (edges) while floors, ramps, and cones fill the
  cell footprint. Pieces snap to the global grid and to each other along these
  cell edges. Source: F1. Confidence: medium (secondary, not re-verified this run;
  it matches Fort's own wall-on-edge vs cell-slot model in the audit).
- Structural support: Fortnite freebuild lets ground-contacting pieces stand on
  their own, while elevated pieces need an adjacent or supporting piece to attach
  to; unsupported structures can fall. Source: F1. Confidence: medium. Note: exact
  support-neighbor rules are not published as a table; this is the qualitative
  rule the community documents, and it mirrors Fort's `isSupported` logic.
- Build height: structures can be stacked many storeys high; there is no low hard
  cap in normal play (very tall towers are routine). Source: F1. Confidence: low
  on any exact ceiling number; qualitative behavior is high.

## Area 3: Player proportions and motion feel

- Player character height is 192 cm (192 uu = 1.92 m), stated by Epic as the scale
  reference for building. Source: E3. Confidence: high.
- Derived proportion ratios (arithmetic from E1 and E3, confidence high):
  - Wall height / player height = 384 / 192 = 2.0. A wall is exactly two players
    tall; the player reads as half a wall.
  - Cell width / player height = 512 / 192 = 2.67. The player is about 37 percent
    of one cell's width; roughly two and a half players fit across a floor tile.
  - Cone/roof peak / player height = 192 / 192 = 1.0 (using the 192 uu peak). A
    roof peak is about one player tall above its base.
- Capsule and camera: Fortnite is third person, over the shoulder, with the camera
  a fixed distance behind and slightly above the character (the standard Unreal
  third-person framing). Source: E7. Confidence: medium (engine-level framing;
  Fortnite's exact boom length and shoulder offset are not published). Unreal's
  first-person template default eye height is 64 uu above capsule center [E8], a
  substrate value only; Fortnite's third-person camera does not expose a published
  eye height.
- Motion feel is weighty but responsive: near-instant ground acceleration to full
  speed, quick stops, and strong air control, which is what makes build-fighting
  and edit-plays feel tight. This is a qualitative community consensus rather than
  a published number. Source: F2. Confidence: medium (qualitative), low (any exact
  acceleration value).

## Area 4: Movement values

Important caveat: Epic does not publish exact Fortnite movement speeds, jump
velocity, or gravity. The values below separate what is solidly sourced (the
Unreal Engine substrate defaults, which Fortnite overrides) from community
estimates (which need in-game measurement to confirm). The brief's instruction to
"not trust a single hobbyist source" is why the Fortnite-specific numbers are held
at low confidence here.

Engine substrate (Unreal Engine defaults that Fortnite is built on and tunes):

- Default character `MaxWalkSpeed` is 600 uu/s (6.0 m/s). Source: E8. Confidence:
  high as a UE default, but Fortnite overrides it.
- Default `JumpZVelocity` is 420 uu/s; default `Gravity Z` is -980 uu/s^2. A
  jump's apex is about v^2 / (2 g). Source: E8. Confidence: high as UE defaults,
  overridden by Fortnite.

Fortnite-specific behavior (qualitative, well sourced):

- Sprint (tactical sprint) is activated by holding Left Shift and increases the
  player's speed above the default jog; jumping while sprinting gives a higher and
  longer jump. Source: E4 (Epic). Confidence: high (behavior), not a number.
- Sprint is stamina-limited: a stamina bar drains while sprinting and, when
  empty, the player drops back to normal jog speed until it recovers. Sprinting
  also lowers the equipped weapon. Source: F2. Confidence: medium (behavior).
- There is no fall damage from normal building or terrain heights in Battle
  Royale (falls do not hurt the player in standard modes). Source: F2. Confidence:
  medium.

Fortnite-specific numbers (community estimates, low confidence, verify by
measurement):

- Base run/jog speed is commonly cited around 500 uu/s (about 5.0 m/s). Source:
  community estimate (no citable primary). Confidence: low.
- Tactical sprint is commonly cited as roughly 25 to 30 percent faster than jog
  (order of 640 uu/s, about 6.4 m/s). Source: community estimate. Confidence: low.
- Crouch speed is notably slower than jog (community estimates put it near half to
  two-thirds of run speed). Source: community estimate. Confidence: low.
- Jump height lands near 0.9 to 1.0 m (about half a player height), consistent
  with a jump velocity near the UE default against roughly Earth-like gravity.
  Source: derived estimate from E8. Confidence: low.
- Forward, strafe, and backpedal: sprint is forward-only, while normal jog is
  broadly similar across directions; any small strafe/backpedal penalty is not
  reliably documented. Source: F2. Confidence: low.

Open question for the implementing session: the exact jog and sprint speeds, jump
apex, and rise-vs-fall gravity split should be measured in-game (or accepted from
Fort's already tuned values) rather than trusted from a single community page. See
the "open questions" section.

## Area 5: Placement, ghost, and turbo cadence

- Turbo build lets a player hold the build key to place a run of pieces
  automatically as they move and aim. Source: F1. Confidence: high (behavior).
- Turbo cadence (era-specific, F1 and D1):
  - The first piece is placed about 0.15 s after the build key is held; while
    turbo-building, subsequent pieces were placed about every 0.05 s (the v4.30
    era), which is about 20 pieces per second. Source: F1, D1. Confidence: medium.
  - In the v10.20 update (Chapter 1 Season X, 2019), Epic raised the between-piece
    interval from 0.05 s to 0.15 s (about 6.7 pieces per second) as a nerf; this
    was widely disliked and later adjusted. Source: D1. Confidence: medium
    (era-specific, not the lasting value).
  - A later value cited for the between-piece interval is 0.005 s (v10.20.1), and
    there is roughly a 0.15 s cooldown before a new piece can be placed in the
    same spot where one was just destroyed. Source: F1. Confidence: medium.
  - Net for parity: turbo build is very fast, on the order of several to ~20
    pieces per second depending on era, gated by a short first-piece delay and a
    same-spot replace cooldown. Confidence: medium.
- Ghost preview: while in build mode a translucent preview of the selected piece
  snaps to the targeted grid cell or edge and shows whether placement is valid.
  The valid-versus-invalid state is conveyed by color. Source: F1. Confidence:
  medium (behavior); the exact hex colors are not published, and Fort's own blue
  (valid) and red (invalid) are an original choice.
- Targeting: the aim ray picks the piece type's slot: walls snap to the nearest
  cell edge facing the player, floors to the aimed cell, ramps face away from the
  player, and cones cap the cell. Source: F1. Confidence: medium (matches Fort's
  targeting model in the audit).

## Area 6: Edit grid and gesture

- Editing is a hold-to-edit, drag-select gesture: the player holds the edit key
  while aiming at an owned piece, which opens a selection grid drawn on the piece;
  dragging across tiles selects them, and the edit applies on confirm. A reset
  returns the selection to the original piece. Source: F1. Confidence: medium.
- Per-piece edit grids (F1): walls use a 3 x 3 grid; cones/pyramids use a 2 x 2
  corner grid (raising corners to make directional or peaked roofs); stairs use a
  direction-based grid (to re-face or narrow the ramp). Source F1 also groups
  floors with walls at 3 x 3; this floor grid count is the one number worth
  confirming in-game, because it is commonly understood as a 2 x 2 for floors and
  Fort itself uses 2 x 2 for floor/stairs/roof. Confidence: medium for wall = 3 x
  3, low for the exact floor/ramp/cone tile counts (verify by measurement).
- Canonical edit shapes players make: window (remove the center tile of a wall),
  door or doorway (remove the bottom-center column of a wall), half wall (keep the
  bottom row), floor hole (remove tiles of a floor), cone or pyramid corner (raise
  one corner), and ramp re-facing or half ramp (redirect or narrow a stair).
  Source: F1 plus general community knowledge. Confidence: medium.
- Confirm behavior: the edit applies on release of the edit key or on a confirm
  input, and can be reset before confirming. Source: F1. Confidence: medium (Fort
  models confirm-on-press and an optional confirm-on-release toggle in the audit).

## Area 7: Gameplay loop and HUD

- Freebuild loop: harvest materials by hitting the environment with the pickaxe,
  enter build mode, select a piece (wall, floor, ramp/stair, cone/roof), aim so
  the ghost snaps to the grid, place (single tap or hold for turbo), edit by
  holding the edit key and drag-selecting the grid then confirming, and destroy or
  reclaim with the pickaxe. Material is cycled and pieces are swapped from the
  build tray. A build-versus-combat toggle switches between building and holding a
  weapon or the pickaxe. Source: F1, E4. Confidence: medium.
- Default PC build keybinds (K1, K2): Wall = F1, Floor = F2, Stairs/Ramp = F3,
  Roof/Cone = F4 (some schemes add Trap = F5 or T); Edit = G; the build/combat or
  build-mode toggle is commonly Q. Source: K1, K2. Confidence: medium (these are
  the game's defaults; competitive players routinely rebind to mouse buttons and
  nearby keys). Note: Fort's defaults differ deliberately (Z/X/C/V for the four
  pieces, G for edit), which is an original, ergonomic choice, not a copy.
- HUD information hierarchy (general Fortnite BR layout, community-documented):
  crosshair at screen center; the build-piece selector or tray plus the material
  and quantity indicator sit at the bottom, usually bottom-right, showing the four
  pieces and the active material with its count; a mode indicator distinguishes
  build from combat; the minimap and compass sit at the top (top-left minimap in
  BR). Health and shield bars sit at the bottom-center. Source: general community
  layout knowledge, not a single citable spec. Confidence: low to medium on exact
  positions. Note: Fort's HUD (audit) uses a center crosshair, a bottom-right
  4-slot tray plus material indicator, a mode chip, and a top-right minimap, which
  is close to this hierarchy.

## Materials and harvesting

- Current material hit points (M1): wood starts at 100 HP and matures to 150 HP;
  brick (stone) starts at 100 HP and matures to 300 HP; metal starts at 80 HP and
  matures to 400 HP. Source: M1. Confidence: medium (secondary sources agree; the
  precise numbers drift by patch).
- Maturation behavior: a freshly placed or edited structure spawns at roughly half
  its full HP and climbs to full over a few seconds. Source: M1. Confidence:
  medium. This is a notable behavior Fort does not currently model (Fort pieces
  are placed at full material HP, per the audit).
- Historical anchor (patch 5.10, Chapter 1 Season 5, G1): wood 80 start / 150 max,
  stone 80 start, metal max 450 (nerfed from 500). This shows the exact numbers
  move across patches while the ratio stays stable. Source: G1. Confidence: medium
  (era-specific).
- Ratio for parity: full-HP wood:brick:metal is about 150:300:400, i.e. roughly
  1:2:2.7 (historically as wide as 1:3). Metal is the toughest, wood the weakest.
  Source: M1, G1. Confidence: medium. (Fort models wood 2, stone 3, metal 5 in
  Mattock swings per the audit, a ratio of 1:1.5:2.5.)
- Pickaxe damage (patch 5.10 anchor, G1): 75 damage per swing to structures and
  harvestable environment (150 on a critical or weak-point hit), while damage to
  enemy players stayed 50 (100 crit). Source: G1. Confidence: medium
  (era-specific; current exact numbers not re-verified). The harvesting weak-point
  (a highlighted circle that appears on a resource and doubles damage) is a
  long-standing mechanic. Confidence: medium.

## Confidence summary and open questions

High confidence (primary Epic or arithmetic), safe to build against:

- 1 uu = 1 cm; grid tile 512 uu = 5.12 m [E2, E3].
- Wall 512 x 384 x 24 uu (4:3 width-to-height) [E1].
- Floor and ceiling 512 x 512 x 24 uu [E1].
- Stairs 512 x 512 footprint, 384 rise [E1].
- Player 192 cm; wall is 2x player height; cell width is 2.67x player height [E3].
- Chapter 4+ uses Lumen dynamic real-time global illumination [E5].
- Art direction is intentionally readable-stylized, saturated, no toon outline
  [E6, B1, B2].

Medium confidence (good sources, not fully re-verified this run):

- Cone/roof peak about 192 uu (half a wall) [E1 refutation, F1].
- Support rules, 1x1x1 cell snapping, wall-on-edge model [F1].
- Turbo cadence (first piece ~0.15 s, between-piece 0.05 s classic, era changes)
  [F1, D1].
- Edit gesture and wall 3 x 3 grid [F1].
- Material HP wood 100/150, brick 100/300, metal 80/400, spawn at half and mature
  [M1]; pickaxe ~75 to structures [G1].
- Default keybinds F1 to F4, Edit G, toggle Q [K1, K2].

Low confidence (community estimate, must be measured in-game to trust):

- Exact jog speed (~500 uu/s), sprint speed and multiplier (~25 to 30 percent
  faster), crouch speed, jump apex (~0.9 to 1.0 m), rise-versus-fall gravity split.
- Exact floor/ramp/cone edit tile counts (wall 3 x 3 is solid; the others need
  confirmation).
- Exact ghost preview colors and exact HUD element positions.

Open questions to resolve before or during implementation (carry into Phase 2 and
the design phase):

1. Movement numbers: measure jog, sprint, crouch, jump apex, and airtime in-game,
   or accept Fort's already-tuned values, rather than trusting a single community
   figure. This is the biggest low-confidence area and it is mechanics-critical.
2. Floor, ramp, and cone edit grids: confirm the exact tile counts against the
   real game (wall 3 x 3 is settled).
3. Cone/roof height: confirm the peak is about 192 uu (half a wall) versus a full
   384.
4. Material maturation: confirm the spawn-at-half then mature-to-full timing and
   the current exact HP values.

## Reference anchors for Phase 2 (no delta computed here)

Co-located so Phase 2 can build the ranked delta table. The Fort values come from
`docs/audit.md`; this table does not judge or rank, it only places X beside Y.

| Dimension | Fortnite X (source, confidence) | Fort Y (audit) |
|---|---|---|
| Cell footprint | 5.12 m (512 uu) [E1, high] | 4.0 m (CELL_SIZE 4) |
| Wall height | 3.84 m (384 uu) [E1, high] | 3.0 m (CELL_HEIGHT 3) |
| Footprint : height | 4 : 3 [E1, high] | 4 : 3 (grid.ts) |
| Player height | 1.92 m (192 uu) [E3, high] | 1.8 m (PLAYER.standHeight) |
| Wall : player height | 2.0 [E1, E3, high] | 1.67 (3.0 / 1.8) |
| Cone/roof peak | ~1.92 m (192 uu) [F1, medium] | roof is CELL_HEIGHT tall geometry (audit) |
| Base run speed | ~5.0 m/s (~500 uu/s) [community, low] | 5.5 u/s (MOVE.runSpeed) |
| Sprint speed | ~6.4 m/s (~640 uu/s) [community, low] | 6.6 u/s (MOVE.sprintSpeed) |
| Jump apex | ~0.9 to 1.0 m [derived, low] | ~1.5 units (jumpApex) |
| Turbo interval | 0.05 s classic (era-varying) [F1, D1, medium] | 0.1 s (TURBO_INTERVAL) |
| Wall edit grid | 3 x 3 [F1, medium] | 3 x 3 (edit-grid.ts) |
| Floor edit grid | 3 x 3 claimed, likely 2 x 2 [F1, low] | 2 x 2 (edit-grid.ts) |
| Material HP ratio | ~1 : 2 : 2.7 (150/300/400) [M1, medium] | 1 : 1.5 : 2.5 (2/3/5 swings) |
| Material maturation | spawn ~half, mature to full [M1, medium] | none (placed at full) |
| Pickaxe to structures | ~75 per swing [G1, medium] | 1 HP per swing (audit) |

## Deliverable status

- `docs/research.md` (this file): complete, sourced, own-words, zero embedded
  assets.
- Primary gathering used the `/deep-research` workflow; it was cut off by a
  session usage limit mid-verification, so the load-bearing build and unit facts
  are fully adversarially verified while several secondary facts are carried at
  medium or low confidence with the gaps flagged above.
- Next phase (not started): Phase 2 gap analysis, which turns this X column and
  the audit's Y column into a ranked, mechanics-first delta table in
  `docs/gap-analysis.md`.

## T26 parity observation pass (Run B, dated 2026-07-05)

Timeboxed observation feeding Run B tickets T27, T28, and T35, per the T26 plan
entry. No live Fortnite client was available in this session, so observation drew
on current community references (wiki and building-edit guides) rather than
frame-accurate gameplay capture. Each item is dated and given a confidence; where
a value could not be freshly verified, the rule is "unverified, keeping Fort's
current values." This section is authoritative for the three T26 items; the
Phase 1 tables above are left as the historical dossier and are not re-synced
here.

Fort's current values referenced below: CELL_SIZE 4.8, CELL_HEIGHT 3.6 (T23);
MOVE.runSpeed 5.5, sprintSpeed 6.6, jumpApex ~1.50 (movement-tuning.ts);
TURBO_INTERVAL 0.05, TURBO_FIRST_DELAY 0.15, REPLACE_COOLDOWN 0.15 (T25);
minimap top-right (hud/minimap).

### 1. Movement timing (jog / sprint tile cross, jump apex): UNVERIFIED, kept

- Not freshly measurable here. Epic does not publish jog or sprint speeds, jump
  velocity, or gravity, and no live client or frame-accurate video was available
  this session to time a tile crossing or a jump against a wall. Confidence: low
  (unchanged from Phase 1, Area 4).
- Best available community estimates (carried from Phase 1): jog ~500 uu/s
  (~5.0 m/s), sprint ~640 uu/s (~6.4 m/s), jump apex ~0.9 to 1.0 m (about half a
  player, roughly 24 to 26 percent of a 384 uu wall).
- Converted to Fort units (one 4.8 tile, one 3.6 wall):
  - Community jog: 512 uu / 500 uu/s = 1.02 s per tile, so a Fort jog of ~4.7 u/s
    (4.8 / 1.02).
  - Community sprint: 512 / 640 = 0.80 s per tile, so a Fort sprint of ~6.0 u/s
    (4.8 / 0.80); sprint-to-jog ratio ~1.28.
  - Community jump: ~25 percent of a wall, so ~0.9 u apex against Fort's 3.6 wall.
  - Fort TODAY crosses a tile in 4.8 / 5.5 = 0.87 s (jog) and 4.8 / 6.6 = 0.73 s
    (sprint), and jumps to ~1.50 u = ~42 percent of a wall: faster and floatier
    than the community estimates.
- Verdict for T27 and T28: the community cross-times and jump fraction line up
  with the plan's T27/T28 starting values (run 4.7, sprint 6.0, apex 0.9 = 25
  percent of a wall); no fresh number overrides them, so those remain the
  starting targets, to be accepted or nudged at the feel gate (where a live
  client or capture can time them if one is available). Confidence: low.

### 2. Floor / ramp / cone edit tile counts: CONFIRMED

- Wall 3 x 3 (settled). Confidence: high.
- Floor 2 x 2, cone/pyramid (roof) 2 x 2, stairs direction-based (re-face or
  narrow the ramp), corroborated across current community building-edit guides.
  Confidence: medium-high (independent references agree; Epic publishes no spec).
  This resolves the Phase 1 open question (floor "3 x 3 claimed, likely 2 x 2"):
  floor is 2 x 2.
- Fort already uses wall 3 x 3 and floor/stairs/roof 2 x 2 (edit-grid.ts), so
  Fort MATCHES. The T26 conditional follow-up (a coupled edit-grid.ts plus
  variants-catalog.ts floor-grid change) is NOT triggered; no future ticket is
  needed for this.

### 3. Minimap corner: CONFIRMED top-right; Fort matches

- Current Fortnite Battle Royale shows the mini-map in the TOP-RIGHT corner by
  default (HUD elements are player-repositionable, but top-right is the default).
  Confidence: medium-high (multiple current community references agree). This
  corrects the Phase 1 Area 7 aside that said "top-left minimap in BR", which was
  low confidence and wrong.
- Fort's minimap is already top-right (hud/minimap), so Fort MATCHES. T35's
  conditional "minimap moves only if T26 confirms" is therefore NOT triggered:
  the minimap stays top-right.

Sources (accessed 2026-07-05): Fortnite Fandom Building wiki and current
community building-edit guides (edit-grid tile counts); Orcz Fortnite Battle
Royale Mini-map and GameRevolution Fortnite minimap guide (minimap corner).
Movement numbers remain community estimates with no citable primary and are held
at low confidence, per the brief's rule against trusting a single hobbyist source.
