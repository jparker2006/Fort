// All movement tunables in one place for the feel pass.
//
// Fortnite-relative targets (shipped values chosen to match):
//
//   Tunable         Target behavior                                Shipped
//   runSpeed        brisk jog, full speed almost instantly         5.5 u/s
//   sprintSpeed     ~20% faster than run, forward-only             6.6 u/s
//   crouchSpeed     slow, deliberate                               2.8 u/s
//   groundAccel     near-instant to full speed (snappy)            60 u/s^2
//   groundDecel     quick stop with a faint skid                   55 u/s^2
//   airAccel        strong steering; can reverse mid-jump          45 u/s^2
//   airMaxSpeed     air speed capped at sprint speed               6.6 u/s
//   jumpSpeed       apex ~1.5 units above takeoff                  6.8 u/s
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
  runSpeed: 5.5,
  sprintSpeed: 6.6,
  crouchSpeed: 2.8,
  groundAccel: 60,
  groundDecel: 55,
  airAccel: 45,
  airMaxSpeed: 6.6,
  jumpSpeed: 6.8,
  riseGravity: 15.41,
  fallGravity: 26.0,
  maxFallSpeed: 40,
  coyoteTime: 0.06,
  jumpBuffer: 0.08,
  stepHeight: 0.6,
  /** Documented Fortnite-relative apex target for the automated arc test. */
  jumpApexTarget: 1.5,
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
