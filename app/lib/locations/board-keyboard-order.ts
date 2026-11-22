// Which drop target an arrow key moves a picked-up chip to on the Housing
// Board. Pure geometry on the targets' rects, so it is unit-tested apart from
// dnd-kit; `boardKeyboardCoordinates` feeds it the board's droppables.
//
// The order: Left and Right walk along the row the chip is in; Up and Down go
// to the nearest tile in the row above or below. A location's boundary is
// crossed only when there is no row in that direction inside it, because the
// next location's tiles are further away than the current location's own rows.

export type BoardDirection = "up" | "down" | "left" | "right";

export interface BoardRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface BoardTarget<Id> extends BoardRect {
  id: Id;
}

// Rect edges from the layout can be off by a fraction of a pixel.
const EPSILON = 0.5;

const centreX = (rect: BoardRect) => rect.left + rect.width / 2;
const centreY = (rect: BoardRect) => rect.top + rect.height / 2;
const bottom = (rect: BoardRect) => rect.top + rect.height;
const right = (rect: BoardRect) => rect.left + rect.width;

// Whether two rects share some of their height, which is what puts them in
// the same row.
const overlapsVertically = (a: BoardRect, b: BoardRect) =>
  a.top < bottom(b) - EPSILON && b.top < bottom(a) - EPSILON;

// Whether two rects share some of their width, which is what puts one above
// the other.
const overlapsHorizontally = (a: BoardRect, b: BoardRect) =>
  a.left < right(b) - EPSILON && b.left < right(a) - EPSILON;

const closest = <Id>(
  candidates: BoardTarget<Id>[],
  ...distances: ((target: BoardTarget<Id>) => number)[]
): Id | null => {
  let best: BoardTarget<Id> | null = null;
  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }
    for (const distance of distances) {
      const difference = distance(candidate) - distance(best);
      if (Math.abs(difference) <= EPSILON) continue;
      if (difference < 0) best = candidate;
      break;
    }
  }
  return best?.id ?? null;
};

/**
 * The target an arrow press moves to from `current`, or null when there is
 * none in that direction.
 *
 * - The target the chip is over (`current.id`) is never returned.
 * - Rects are compared by their centres.
 * - Left and Right only consider targets in the same row (sharing some of the
 *   current one's height), nearest first.
 * - Up and Down only consider targets wholly above or below, by vertical gap
 *   first and then by the distance between centres across. The side target
 *   counts only when it shares some width with `current`: in the wide layout
 *   it is a column beside the tiles, as tall as its contents, so its bottom
 *   edge can fall between two rows without it being above either.
 * - From the side target, Left goes to the nearest row's tile from its top,
 *   not its middle: a long tray would otherwise land far down the board.
 * - Right from the last tile in a row goes to `sideTargetId` (the Unplaced
 *   tray) when it sits in a column to the right of the tiles, as it does in
 *   the wide layout. In the narrow layout it is below them, reached with Down.
 */
export function nextDropTarget<Id>(
  direction: BoardDirection,
  current: BoardRect & { id?: Id | null },
  candidates: BoardTarget<Id>[],
  sideTargetId?: Id,
): Id | null {
  const others = candidates.filter((target) => target.id !== current.id);
  const x = centreX(current);
  const y =
    sideTargetId !== undefined && current.id === sideTargetId
      ? current.top
      : centreY(current);
  const across = (target: BoardTarget<Id>) => Math.abs(centreX(target) - x);
  const along = (target: BoardTarget<Id>) => Math.abs(centreY(target) - y);

  switch (direction) {
    case "left":
    case "right": {
      const sign = direction === "right" ? 1 : -1;
      const inRow = others.filter(
        (target) =>
          overlapsVertically(target, current) &&
          (centreX(target) - x) * sign > EPSILON,
      );
      const inRowTarget = closest(inRow, across, along);
      if (inRowTarget !== null || direction === "left") return inRowTarget;
      const side = others.find((target) => target.id === sideTargetId);
      return side && side.left >= right(current) - EPSILON ? side.id : null;
    }
    case "up":
    case "down": {
      const gap =
        direction === "down"
          ? (target: BoardTarget<Id>) => target.top - bottom(current)
          : (target: BoardTarget<Id>) => current.top - bottom(target);
      const inLine = others.filter(
        (target) =>
          gap(target) >= -EPSILON &&
          (target.id !== sideTargetId || overlapsHorizontally(target, current)),
      );
      return closest(inLine, gap, across);
    }
  }
}
