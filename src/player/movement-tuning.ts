// All movement tunables in one place for the feel pass.
//
// Fortnite-relative targets (shipped values chosen to match). T27 retuned the
// traversal speeds to Fortnite's observed cell-crossing times against the T23
// 4.8-unit cell: a jog crosses one cell in ~1.02 s and a tactical sprint in
// ~0.8 s (T26, Area 4), so runSpeed = 4.8 / 1.02 and sprintSpeed = 4.8 / 0.8.
//
//   Tunable         Target behavior                                Shipped
//   runSpeed        jog, one 4.8 cell in ~1.02 s                   4.7 u/s
//   sprintSpeed     ~28% faster than run, forward-only (~0.8 s)    6.0 u/s
//   crouchSpeed     slow, deliberate (keeps ~0.51 crouch:run)      2.4 u/s
//   groundAccel     near-instant to full speed (snappy)            60 u/s^2
//   groundDecel     quick stop with a faint skid                   55 u/s^2
//   airAccel        strong steering; can reverse mid-jump          45 u/s^2
//   airMaxSpeed     air speed capped at sprint speed               6.0 u/s
//   jumpSpeed       apex ~0.9 units (25% of a 3.6 wall)            5.27 u/s
//   riseGravity     floaty-ish rise                                15.41 u/s^2
//   fallGravity     snappier descent than rise                     26.0 u/s^2
//   maxFallSpeed    terminal velocity, no fall damage              40 u/s
//   coyoteTime      tiny grace after leaving a ledge               0.06 s
//   jumpBuffer      tiny pre-land buffer                           0.08 s
//   stepHeight      auto-step small ledges and stair treads        0.6 units
//
// jumpApex() derives the apex from jumpSpeed and riseGravity so the arc target
// stays honest if either value is retuned.

export const MOVE = {
  runSpeed: 4.7,
  sprintSpeed: 6.0,
  crouchSpeed: 2.4,
  groundAccel: 60,
  groundDecel: 55,
  airAccel: 45,
  airMaxSpeed: 6.0,
  // T28: apex retuned to ~0.9 (Fortnite's ~half-a-player jump, 25% of a 3.6 wall,
  // T26 Area 4). jumpApex() = 5.27^2 / (2 * 15.41) = 0.90; rise/fall gravity keep
  // Fort's liked asymmetric feel (Fortnite's split is unpublished).
  jumpSpeed: 5.27,
  riseGravity: 15.41,
  fallGravity: 26.0,
  maxFallSpeed: 40,
  coyoteTime: 0.06,
  jumpBuffer: 0.08,
  stepHeight: 0.6,
  // T29 sprint stamina. While sprint-active (sprint held, forward-dominant,
  // grounded, not crouching) stamina drains staminaDrain per second, so a full
  // bar lasts staminaMax seconds (6 s). Off sprint it regenerates staminaRegen
  // per second (empty to full in 3 s). Once emptied sprint is blocked until
  // stamina recovers above staminaReengage of the max (hysteresis, no flicker).
  // A jump that STARTS while sprint-active multiplies takeoff velocity by
  // sprintJumpBoost, so the apex scales by its square (~1.21x). Airborne freezes
  // both drain and regen. The feel gate may cut the drain or lengthen staminaMax.
  staminaMax: 6.0,
  staminaDrain: 1.0,
  staminaRegen: 2.0,
  staminaReengage: 0.15,
  sprintJumpBoost: 1.1,
  /** Documented Fortnite-relative apex target for the automated arc test. */
  jumpApexTarget: 0.9,
} as const;

/** Analytic apex height above takeoff for the current jump/gravity values. */
export function jumpApex(): number {
  return (MOVE.jumpSpeed * MOVE.jumpSpeed) / (2 * MOVE.riseGravity);
}

/** Analytic total airtime (rise + fall back to takeoff height). */
export function jumpAirtime(): number {
  const apex = jumpApex();
  const riseTime = MOVE.jumpSpeed / MOVE.riseGravity;
  const fallTime = Math.sqrt((2 * apex) / MOVE.fallGravity);
  return riseTime + fallTime;
}
