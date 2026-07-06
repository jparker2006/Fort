import "./style.css";
import * as THREE from "three";
import { Game, type System } from "./core/game.ts";
import { World } from "./world/island.ts";
import { InputSystem } from "./input/input-system.ts";
import { DebugInputOverlay } from "./input/debug-input-overlay.ts";
import { Player } from "./player/player.ts";
import { CameraRig } from "./player/camera-rig.ts";
import { makeBox } from "./player/collision.ts";
import { CELL_MIN, CELL_MAX } from "./world/grid.ts";
import { BuildSystem } from "./build/build-system.ts";
import { BuildController, type BuildMode } from "./build/build-controller.ts";
import { DestroyController } from "./build/destroy-controller.ts";
import { EditController } from "./edit/edit-controller.ts";
import { variantGeometry, variantColliders } from "./edit/variants-catalog.ts";
import { makeBuildMaterial } from "./build/materials.ts";
import { Hud } from "./hud/hud.ts";
import { Minimap } from "./hud/minimap.ts";
import { SettingsMenu } from "./settings/settings-menu.ts";
import { SessionController } from "./pwa/session.ts";
import { loadInput } from "./input/persistence.ts";
import { formatBindLabel } from "./input/bindings.ts";
import { wallOnEdge, floorSlot, stairsSlot, roofSlot, slotKey, decodeSlotKey } from "./build/slots.ts";
import type { Material, Rotation, PieceType } from "./build/piece.ts";
import { registerServiceWorker } from "./pwa/register-sw.ts";
import { bootTurntable } from "./character/turntable.ts";

// Island, input, player (original hero), and the third-person camera rig.
// The ?turntable query param launches the character review scene instead.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

if (new URLSearchParams(location.search).has("turntable")) {
  bootTurntable(app);
} else {
  bootGame(app);
}

// Register the PWA service worker (production builds only; the plugin emits
// sw.js at build time). Harmless no-op in dev and unit runs.
if (import.meta.env.PROD) registerServiceWorker();

function bootGame(app: HTMLElement): void {
const game = new Game({ parent: app });

const input = new InputSystem();
// Input stays disabled until the session enters the playing state (T18 gates it
// behind the title screen's Play click and pointer lock).
game.add(input);
game.add(new World());

const player = new Player(input);
game.add(player);

const cameraRig = new CameraRig(input, player);
game.add(cameraRig);

// Movement is camera-relative: feed the camera yaw to the player.
player.setYawSource(() => cameraRig.yaw);

// The spring arm collides against the ground so the camera never dips below it.
const ground = game.scene.getObjectByName("ground");
if (ground) cameraRig.addCollider(ground);

// Build system: pool meshes join the camera spring-arm colliders as they are
// created so the camera never clips through placed pieces.
const build = new BuildSystem(
  game.scene,
  player.collision,
  (pool) => cameraRig.addCollider(pool.mesh),
  makeBuildMaterial,
  { geometry: variantGeometry, colliders: variantColliders },
);
game.add(build);

// Build-mode targeting and ghost preview. Added after the camera rig so its
// per-frame update reads the freshly integrated aim ray.
// Edit mode: added before the build/destroy controllers so it claims the
// crosshair and primary fire (same frame) while editing.
const editController = new EditController(input, cameraRig, player, build.model);
game.add(editController);

const buildController = new BuildController(input, cameraRig, player, build.model);
buildController.setSuppressor(() => editController.isEditing());
game.add(buildController);

// One shared gameplay-settings object, loaded from storage and referenced by
// both controllers and the settings menu, so a toggle takes effect everywhere.
const gameplay = loadInput().gameplay;
buildController.gameplay = gameplay;
editController.gameplay = gameplay;

// Mattock destroy mode: swings when the controller's mode is "mattock".
const destroyController = new DestroyController(
  input,
  cameraRig,
  player,
  build.model,
  () => buildController.getMode(),
  () => editController.isEditing(),
);
game.add(destroyController);

// HUD overlay (crosshair, piece tray, material and mode indicators). Reads the
// controllers through a small source interface and pulls bind labels live.
const hud = new Hud(app, {
  mode: () => (editController.isEditing() ? "edit" : buildController.getMode()),
  piece: () => buildController.getPieceType(),
  material: () => buildController.getMaterial(),
  bindLabel: (action) => formatBindLabel(input.bindings.get(action)),
  stamina: () => player.state.staminaFraction,
});
game.add(hud);

// Top-right minimap: island, placed pieces by material, and a player wedge.
const minimap = new Minimap(app, {
  forEachPiece: (cb) => build.model.forEachMapPiece(cb),
  playerPos: () => ({ x: player.state.position.x, z: player.state.position.z }),
  // The wedge shows the view facing (camera yaw), matching the minimap arrow
  // convention: it points where the player is looking.
  playerYaw: () => cameraRig.yaw,
});
game.add(minimap);

// Settings menu (also the pause overlay): rebinding, sensitivity, and gameplay
// toggles. The session owns pause/input; the menu just requests resume.
const settings = new SettingsMenu(app, {
  input,
  gameplay,
  onResume: () => session.resume(),
});
game.add(settings);

// Session lifecycle: title -> playing -> paused, with fullscreen + pointer lock.
const session = new SessionController({
  app,
  input,
  settings,
  onPause: () => {
    editController.cancel();
    buildController.cancelTransient();
  },
});
game.add(session);

// Live action-state overlay (toggle with Backslash).
const inputOverlay = new DebugInputOverlay(app, input);
game.add({ name: "input-overlay", update: () => inputOverlay.update() } satisfies System);

game.start();

// Debug helpers for verification: place a collidable box, and read the aim ray
// hit on the ground plane.
const debug = {
  placeBox(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xb06a3a }),
    );
    box.position.set(x, y, z);
    box.name = "debug-box";
    game.scene.add(box);
    cameraRig.addCollider(box);
  },
  // Place a solid collision box (mesh + collider + camera collider). Center at
  // (x,y,z), size (w,h,d). Used to test jump-onto, step-up, and blocking.
  placeSolid(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x9a7b53 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    game.scene.add(mesh);
    player.collision.add(makeBox(x, y, z, w, h, d));
    cameraRig.addCollider(mesh);
  },
  playerPos(): { x: number; y: number; z: number } {
    return { x: player.state.position.x, y: player.state.position.y, z: player.state.position.z };
  },
  onGround(): boolean {
    return player.state.onGround;
  },
  teleport(x: number, y: number, z: number): void {
    player.state.position.set(x, y, z);
    player.state.velocity.set(0, 0, 0);
    player.state.onGround = y <= 0;
  },
  setYaw(yaw: number): void {
    cameraRig.yaw = yaw;
  },
  setPitch(pitch: number): void {
    cameraRig.pitch = pitch;
  },
  aimGroundHit(): { x: number; z: number } | null {
    const ray = cameraRig.getAimRay();
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  },
  // Advance the engine deterministically (headless browsers throttle rAF).
  pump(frames = 1): void {
    for (let i = 0; i < frames; i++) game.stepForTest();
  },
  setAimMode(v: boolean): void {
    player.aimMode = v;
  },
  buildSwing(): void {
    player.triggerBuildSwing();
  },
  animState(): string {
    return player.animState;
  },
  bodyYaw(): number {
    return player.state.yaw;
  },
  boneRotX(name: string): number {
    const b = player.getHero().bones.get(name);
    return b ? b.rotation.x : 0;
  },
  // Player state probes (T29).
  player: {
    stamina(): number {
      return player.state.staminaFraction;
    },
  },
  // Build model helpers (T09): place pieces by cell address and inspect state.
  build: {
    wall(cx: number, cy: number, cz: number, dir: "N" | "S" | "E" | "W", opts: BuildDebugOpts = {}): boolean {
      return build.place(wallOnEdge(cx, cy, cz, dir), opts);
    },
    floor(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(floorSlot(cx, cy, cz), opts);
    },
    stairs(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(stairsSlot(cx, cy, cz), opts);
    },
    roof(cx: number, cy: number, cz: number, opts: BuildDebugOpts = {}): boolean {
      return build.place(roofSlot(cx, cy, cz), opts);
    },
    removeFloor(cx: number, cy: number, cz: number): boolean {
      return build.remove(floorSlot(cx, cy, cz));
    },
    // Slots currently under the T25 replace cooldown (boundedness probe).
    cooldownCount(): number {
      return build.model.cooldownCount;
    },
    scatter(n: number): number {
      return build.debugScatter(n);
    },
    placeSlotKey(key: string, opts: BuildDebugOpts = {}): boolean {
      return build.place(decodeSlotKey(key), opts);
    },
    materialAt(key: string): Material | null {
      return build.model.get(decodeSlotKey(key))?.material ?? null;
    },
    hpAt(key: string): number {
      return build.model.hpAt(decodeSlotKey(key));
    },
    variantAt(key: string): string | null {
      return build.model.variantAt(decodeSlotKey(key)) ?? null;
    },
    applyEdit(key: string, variant: string, rotation?: Rotation): boolean {
      return build.model.applyEdit(decodeSlotKey(key), variant, rotation as Rotation | undefined);
    },
    count(): number {
      return build.count;
    },
    drawCalls(): number {
      return build.drawCalls;
    },
    colliderCount(): number {
      return player.collision.count;
    },
    rendererDrawCalls(): number {
      return game.renderer.info.render.calls;
    },
  },
  // Performance stress + probes (T20).
  perf: {
    stress(n: number): number {
      return build.debugStress(n);
    },
    poolGrows(): number {
      return build.poolGrows;
    },
    drawCalls(): number {
      return game.renderer.info.render.calls;
    },
    buildPools(): number {
      return build.drawCalls;
    },
    nearComparisons(): number {
      return player.collision.lastNearComparisons;
    },
    // Place n wall pieces of one material into a single pool (turbo-run shape).
    placeRow(n: number): number {
      let count = 0;
      for (let i = 0; i < n; i++) {
        const cx = CELL_MIN + (i % (CELL_MAX - CELL_MIN));
        const cz = CELL_MIN + Math.floor(i / (CELL_MAX - CELL_MIN));
        if (build.place(wallOnEdge(cx, 0, cz, "W"), { material: "wood" })) count++;
      }
      return count;
    },
  },
  // Build-mode targeting/ghost/placement (T10, T11).
  target: {
    setActive(v: boolean): void {
      buildController.setActive(v);
    },
    setMode(m: BuildMode): void {
      buildController.setMode(m);
    },
    mode(): BuildMode {
      return buildController.getMode();
    },
    setPiece(type: PieceType): void {
      buildController.setPieceType(type);
    },
    piece(): PieceType {
      return buildController.getPieceType();
    },
    cycleRotation(): void {
      buildController.cycleRotation();
    },
    cycleMaterial(): void {
      buildController.cycleMaterial();
    },
    material(): Material {
      return buildController.getMaterial();
    },
    setTurbo(on: boolean): void {
      buildController.gameplay.turboBuild = on;
    },
    info(): { key: string | null; rotation: number | null; valid: boolean; ghost: string } {
      const t = buildController.getTarget();
      return {
        key: t ? slotKey(t.slot) : null,
        rotation: t ? t.rotation : null,
        valid: buildController.isValid(),
        ghost: buildController.ghostColorState(),
      };
    },
    ghostColorHex(): number {
      return buildController.ghostColorHex();
    },
  },
  // Edit mode (T13).
  edit: {
    forceHover(index: number | null): void {
      editController.debugForceHover(index);
    },
    state(): { editing: boolean; type: string; hovered: number; selected: number[] } {
      return editController.debugState();
    },
    isEditing(): boolean {
      return editController.isEditing();
    },
  },
  // HUD (T15).
  hud: {
    mode(): string {
      return (document.querySelector("#hud-mode") as HTMLElement | null)?.dataset.mode ?? "";
    },
    trayLabel(type: PieceType): string {
      return hud.trayLabel(type);
    },
    material(): string {
      return (document.querySelector("#hud-material") as HTMLElement | null)?.dataset.material ?? "";
    },
  },
  // Session lifecycle (T18).
  session: {
    play(): void {
      session.play();
    },
    pause(): void {
      session.pause("debug");
    },
    resume(): void {
      session.resume();
    },
    state(): string {
      return session.getState();
    },
    inputEnabled(): boolean {
      return input.isEnabled;
    },
  },
  // Settings menu (T17). Drives the pause + menu directly (not through the
  // pointer-lock state machine) so tests are deterministic in a headless
  // browser where lock grant/loss can race the session state.
  settings: {
    open(): void {
      game.pause("debug");
      input.setEnabled(false);
      settings.openMenu();
    },
    close(): void {
      settings.closeMenu();
      input.setEnabled(true);
      game.resume("debug");
    },
    isOpen(): boolean {
      return settings.isOpen();
    },
    arm(action: string): void {
      settings.debugArm(action as Parameters<typeof settings.debugArm>[0]);
    },
    gameplay(): { turboBuild: boolean; confirmEditOnRelease: boolean; resetEditOnRelease: boolean } {
      return { ...gameplay };
    },
    fov(): number {
      return input.settings.fov;
    },
  },
  // Minimap (T16).
  minimap: {
    redraw(): void {
      minimap.redraw();
    },
    lastRenderMs(): number {
      return minimap.lastRender();
    },
    pieceCount(): number {
      return minimap.pieceCount();
    },
    playerMarker(): { x: number; y: number; yaw: number } {
      return minimap.playerMarker();
    },
  },
  // Mattock destroy mode (T12).
  destroy: {
    swing(): string {
      return destroyController.swing();
    },
    liveParticles(): number {
      return destroyController.liveParticles();
    },
    burst(n: number): void {
      destroyController.debugBurst(n);
    },
  },
};

interface BuildDebugOpts {
  material?: Material;
  rotation?: Rotation;
}

(
  window as unknown as {
    __fort?: {
      game: Game;
      input: InputSystem;
      player: Player;
      cameraRig: CameraRig;
      debug: typeof debug;
    };
  }
).__fort = { game, input, player, cameraRig, debug };
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
}
