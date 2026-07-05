// Build-piece data model types. A placed piece is pure data (slot + material +
// rotation + edit variant); its mesh instance and colliders are derived views
// that the BuildModel keeps in sync. Nothing here touches THREE or the DOM, so
// the whole addressing and validity layer is unit-testable in Node.

export type PieceType = "wall" | "floor" | "stairs" | "roof";
export const PIECE_TYPES: readonly PieceType[] = ["wall", "floor", "stairs", "roof"];

export type Material = "wood" | "stone" | "metal";
export const MATERIALS: readonly Material[] = ["wood", "stone", "metal"];

/** Quarter-turn facing (0..3), used by stairs and roof corner variants. */
export type Rotation = 0 | 1 | 2 | 3;

export type WallAxis = "x" | "z";

// A wall lives on a grid edge, canonicalized so the edge shared by two adjacent
// cells resolves to one slot (the east edge of cell N is the west edge of cell
// N+1). axis "x": the panel normal points along X, sitting at world X =
// line*CELL_SIZE and spanning the Z extent of cell `span`. axis "z": normal
// along Z, at world Z = line*CELL_SIZE, spanning the X extent of cell `span`.
export interface WallSlot {
  readonly kind: "wall";
  readonly axis: WallAxis;
  readonly line: number;
  readonly span: number;
  readonly cy: number;
}

// Floor, stairs, and roof each occupy a distinct sub-volume of a single cell, so
// one cell can independently hold one of each plus its four wall edges.
export interface CellSlot {
  readonly kind: "floor" | "stairs" | "roof";
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
}

export type Slot = WallSlot | CellSlot;

export interface Piece {
  readonly slot: Slot;
  readonly material: Material;
  /** Stairs/roof facing; always 0 for walls and floors. */
  readonly rotation: Rotation;
  /** Edit-variant id; "full" until an edit (T14) swaps it. */
  readonly variant: string;
}

/** The piece type a slot carries (its discriminant doubles as the type). */
export function pieceType(slot: Slot): PieceType {
  return slot.kind;
}
