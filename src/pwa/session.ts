// App-shell session lifecycle: title -> playing -> paused. A minimal original
// title overlay with a Play button starts the session, requesting fullscreen and
// pointer lock from that one user gesture. Losing pointer lock (Esc, alt-tab,
// fullscreen exit) or pressing the pause key always lands in the paused state
// with the sim frozen and gameplay input released; resuming re-acquires lock
// from a fresh click. The pointer-lock / fullscreen requests are best-effort so
// the flow also works in a headless test browser that cannot truly lock.

import type { Game, System } from "../core/game.ts";
import type { InputSystem } from "../input/input-system.ts";
import type { SettingsMenu } from "../settings/settings-menu.ts";

export type SessionState = "title" | "playing" | "paused";

export interface SessionDeps {
  app: HTMLElement;
  input: InputSystem;
  settings: SettingsMenu;
  /** Cancel transient gameplay states (edit, turbo) when pausing. */
  onPause: () => void;
}

export class SessionController implements System {
  readonly name = "session";

  private game!: Game;
  private state: SessionState = "title";
  private lockedOnce = false; // did we ever actually acquire pointer lock?
  private readonly title: HTMLElement;
  // The deferred PWA install prompt, captured from beforeinstallprompt.
  private installPrompt: { prompt: () => void } | null = null;

  constructor(private readonly deps: SessionDeps) {
    this.title = document.createElement("div");
    this.title.id = "title";
    this.title.innerHTML = `
      <div class="title-card">
        <h1 class="title-name">Fort</h1>
        <p class="title-tag">Creative Freebuild Sandbox</p>
        <button id="title-play">Play</button>
        <button id="title-install" hidden>Install</button>
        <p class="title-hint">Click to play. Esc pauses.</p>
      </div>`;
    // Clicking the Play button (or anywhere on the overlay) starts the session
    // from a genuine user gesture, so pointer lock and fullscreen are allowed.
    this.title.addEventListener("click", (e) => {
      if ((e.target as HTMLElement)?.id === "title-install") return; // install, not play
      this.play();
    });
    this.deps.app.appendChild(this.title);
    this.wireInstallPrompt();
  }

  private wireInstallPrompt(): void {
    const installBtn = this.title.querySelector<HTMLButtonElement>("#title-install");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.installPrompt = e as unknown as { prompt: () => void };
      if (installBtn) installBtn.hidden = false;
    });
    installBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.installPrompt?.prompt();
    });
  }

  init(game: Game): void {
    this.game = game;
    game.pause("title"); // sim frozen behind the title screen
    this.deps.input.setEnabled(false);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  update(): void {
    // While playing, the pause key freezes the game. In a real browser Esc also
    // exits pointer lock (handled by onLockChange); this covers the headless
    // path where there is no lock to lose.
    if (this.state === "playing" && this.deps.input.justPressed("settingsMenu")) {
      this.pause("menu");
    }
  }

  getState(): SessionState {
    return this.state;
  }

  play(): void {
    if (this.state === "playing") return;
    this.title.hidden = true;
    this.state = "playing";
    this.deps.settings.closeMenu();
    this.deps.input.setEnabled(true);
    this.game.resume("play");
    this.requestFullscreen();
    this.requestLock();
  }

  pause(reason: string): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.deps.input.setEnabled(false); // releases held keys (no ghost inputs)
    this.deps.onPause(); // cancel edit / turbo safely
    this.game.pause(reason);
    this.deps.settings.openMenu();
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.deps.settings.closeMenu();
    this.deps.input.setEnabled(true);
    this.game.resume("resume");
    // Re-acquire pointer lock from this click gesture. Browsers may briefly
    // refuse a lock requested too soon after exit; the Resume button is itself
    // the "click to resume" affordance, so a refused lock just needs another click.
    this.requestLock();
  }

  private requestLock(): void {
    try {
      // Newer Chromium returns a Promise; swallow rejection (headless / too-soon).
      const r = this.deps.app.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      // Not available (headless or blocked); the session still runs.
    }
  }

  private requestFullscreen(): void {
    try {
      if (!document.fullscreenElement) this.deps.app.requestFullscreen?.().catch(() => {});
    } catch {
      // Fullscreen rejected (headless or user setting); non-fatal.
    }
  }

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.deps.app;
    if (locked) {
      this.lockedOnce = true;
      return;
    }
    // Lock lost. Only pause if we had actually acquired it while playing, so a
    // headless browser that never locks does not spuriously pause.
    if (this.state === "playing" && this.lockedOnce) this.pause("pointerlock-lost");
    this.lockedOnce = false;
  };

  dispose(): void {
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.title.remove();
  }
}
