import { describe, it, expect } from "vitest";
import { Bindings, formatBindLabel } from "./bindings.ts";
import { DEFAULT_BINDINGS } from "./defaults.ts";

describe("Bindings", () => {
  it("starts from defaults and resolves actions by code", () => {
    const b = new Bindings();
    expect(b.get("moveForward")).toBe("KeyW");
    expect(b.actionFor("KeyW")).toBe("moveForward");
    expect(b.actionFor("KeyNope")).toBeUndefined();
  });

  it("defaults have no conflicts", () => {
    const b = new Bindings();
    expect(b.conflicts()).toEqual([]);
  });

  it("rebinds to a free code", () => {
    const b = new Bindings();
    const res = b.rebind("jump", "KeyJ");
    expect(res.ok).toBe(true);
    expect(b.get("jump")).toBe("KeyJ");
  });

  it("rejects a conflicting rebind and leaves state unchanged", () => {
    const b = new Bindings();
    const res = b.rebind("moveForward", "KeyS"); // KeyS is moveBack
    expect(res.ok).toBe(false);
    expect(res.conflictWith).toBe("moveBack");
    expect(b.get("moveForward")).toBe("KeyW");
    expect(b.get("moveBack")).toBe("KeyS");
  });

  it("swaps codes with the conflicting action", () => {
    const b = new Bindings();
    const res = b.rebind("moveForward", "KeyS", "swap");
    expect(res.ok).toBe(true);
    expect(res.conflictWith).toBe("moveBack");
    expect(b.get("moveForward")).toBe("KeyS");
    expect(b.get("moveBack")).toBe("KeyW");
  });

  it("steals a code and leaves the other action unbound", () => {
    const b = new Bindings();
    const res = b.rebind("moveForward", "KeyS", "steal");
    expect(res.ok).toBe(true);
    expect(b.get("moveForward")).toBe("KeyS");
    expect(b.get("moveBack")).toBe("");
    // Empty binds are ignored by conflict detection.
    expect(b.conflicts()).toEqual([]);
  });

  it("detects a conflict present in the initial table", () => {
    const b = new Bindings({ jump: "KeyW" }); // duplicate with moveForward
    const conflicts = b.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe("KeyW");
    expect(conflicts[0]!.actions.sort()).toEqual(["jump", "moveForward"]);
  });

  it("resets a single action and all actions", () => {
    const b = new Bindings();
    b.rebind("jump", "KeyJ");
    b.resetAction("jump");
    expect(b.get("jump")).toBe(DEFAULT_BINDINGS.jump);
    b.rebind("crouch", "KeyN");
    b.resetAll();
    expect(b.toJSON()).toEqual(DEFAULT_BINDINGS);
  });
});

describe("formatBindLabel", () => {
  it("formats codes into readable labels", () => {
    expect(formatBindLabel("KeyW")).toBe("W");
    expect(formatBindLabel("Digit1")).toBe("1");
    expect(formatBindLabel("Space")).toBe("Space");
    expect(formatBindLabel("ShiftLeft")).toBe("L Shift");
    expect(formatBindLabel("Mouse0")).toBe("L Mouse");
    expect(formatBindLabel("Escape")).toBe("Esc");
    expect(formatBindLabel("")).toBe("Unbound");
  });
});
