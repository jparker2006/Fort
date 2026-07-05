// Fixed-timestep stepper with a bounded accumulator.
//
// The simulation runs at a fixed rate (default 120 Hz) regardless of display
// refresh. Each rendered frame we feed the wall-clock delta to advance() and it
// returns how many fixed steps to run plus an interpolation alpha in [0, 1) for
// smooth rendering between sim states.
//
// The accumulator is clamped to maxSteps * fixedDelta so a long stall (tab
// switch, GC pause, breakpoint) cannot trigger a spiral of death where the sim
// tries to catch up with hundreds of steps. This is the "artificial frame
// stall" protection the T02 acceptance criteria call for; see time.test.ts.

export interface StepResult {
  /** Number of fixed sim steps to run this frame. */
  steps: number;
  /** Interpolation factor in [0, 1) between the last and next sim state. */
  alpha: number;
}

export class FixedStepper {
  /** Duration of one fixed simulation step, in seconds. */
  readonly fixedDelta: number;
  private readonly maxSteps: number;
  private accumulator = 0;

  constructor(hz = 120, maxSteps = 8) {
    if (hz <= 0) throw new Error("FixedStepper hz must be positive");
    if (maxSteps <= 0) throw new Error("FixedStepper maxSteps must be positive");
    this.fixedDelta = 1 / hz;
    this.maxSteps = maxSteps;
  }

  /**
   * Accumulate a frame delta (seconds) and report the fixed steps to run.
   * Frame deltas larger than the clamp window are truncated so the sim never
   * runs more than maxSteps in a single frame.
   */
  advance(frameDelta: number): StepResult {
    if (!Number.isFinite(frameDelta) || frameDelta < 0) {
      frameDelta = 0;
    }
    const clampWindow = this.fixedDelta * this.maxSteps;
    this.accumulator += Math.min(frameDelta, clampWindow);

    let steps = 0;
    while (this.accumulator >= this.fixedDelta && steps < this.maxSteps) {
      this.accumulator -= this.fixedDelta;
      steps += 1;
    }

    const alpha = this.accumulator / this.fixedDelta;
    return { steps, alpha };
  }

  /** Drop accumulated time. Call after a pause so the next frame starts clean. */
  reset(): void {
    this.accumulator = 0;
  }
}
