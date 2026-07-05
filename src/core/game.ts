import * as THREE from "three";
import { EventBus, type AppEvents } from "./events.ts";
import { FixedStepper } from "./time.ts";
import { DebugOverlay } from "./debug-overlay.ts";

// A System is a unit of engine behavior (world, player, build, hud, ...).
// fixedUpdate runs at the fixed sim rate; update runs once per rendered frame
// with the real frame delta; render runs once per frame with the interpolation
// alpha. All hooks are optional.
export interface System {
  readonly name: string;
  init?(game: Game): void;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  render?(alpha: number): void;
  dispose?(): void;
}

export interface GameOptions {
  parent: HTMLElement;
  simHz?: number;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  readonly bus = new EventBus<AppEvents>();

  private readonly parent: HTMLElement;
  private readonly stepper: FixedStepper;
  private readonly systems: System[] = [];
  private readonly overlay: DebugOverlay;

  private running = false;
  private paused = false;
  private lastTime = 0;
  private frameMs = 16.6;
  private lastSimSteps = 0;

  constructor(opts: GameOptions) {
    this.parent = opts.parent;
    this.stepper = new FixedStepper(opts.simHz ?? 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add("fort-canvas");
    this.parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    this.overlay = new DebugOverlay(this.parent);

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  add(system: System): this {
    this.systems.push(system);
    system.init?.(this);
    return this;
  }

  get<T extends System>(name: string): T | undefined {
    return this.systems.find((s) => s.name === name) as T | undefined;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.stepper.reset();
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  /** Freeze the simulation clock. Rendering continues so overlays stay live. */
  pause(reason: string): void {
    if (this.paused) return;
    this.paused = true;
    this.bus.emit("pause", { reason });
  }

  resume(reason: string): void {
    if (!this.paused) return;
    this.paused = false;
    // Discard the time spent paused so we do not fast-forward the sim.
    this.lastTime = performance.now();
    this.stepper.reset();
    this.bus.emit("resume", { reason });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private readonly frame = (now: number): void => {
    const frameDeltaMs = now - this.lastTime;
    this.lastTime = now;
    this.frameMs += (frameDeltaMs - this.frameMs) * 0.1;

    if (!this.paused) {
      const frameDelta = frameDeltaMs / 1000;
      const { steps, alpha } = this.stepper.advance(frameDelta);
      this.lastSimSteps = steps;

      for (let i = 0; i < steps; i++) {
        for (const sys of this.systems) sys.fixedUpdate?.(this.stepper.fixedDelta);
      }
      for (const sys of this.systems) sys.update?.(frameDelta);
      for (const sys of this.systems) sys.render?.(alpha);
    }

    this.renderer.render(this.scene, this.camera);

    this.overlay.update({
      fps: this.frameMs > 0 ? 1000 / this.frameMs : 0,
      frameMs: this.frameMs,
      simSteps: this.lastSimSteps,
      drawCalls: this.renderer.info.render.calls,
    });
  };

  private readonly onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.bus.emit("resize", { width: w, height: h });
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.pause("hidden");
    }
    // Resume is intentionally NOT automatic on visible: the pause/settings
    // lifecycle (T18) decides when to re-acquire pointer lock and resume.
  };

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    for (const sys of this.systems) sys.dispose?.();
    this.overlay.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
