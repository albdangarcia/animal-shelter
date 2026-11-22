import {
  KeyboardCode,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  nextDropTarget,
  type BoardDirection,
  type BoardTarget,
} from "@/app/lib/locations/board-keyboard-order";

const directions: Partial<Record<string, BoardDirection>> = {
  [KeyboardCode.Down]: "down",
  [KeyboardCode.Right]: "right",
  [KeyboardCode.Up]: "up",
  [KeyboardCode.Left]: "left",
};

// Keyboard coordinate getter for the shelter board. Instead of nudging the
// dragged chip a fixed number of pixels (dnd-kit's default), each arrow press
// jumps it straight to the next droppable (unit tile / Unplaced tray) in that
// direction, so the whole board is reachable in a few presses. Which one is
// next is decided by `nextDropTarget`. `sideTargetId` is the Unplaced tray's
// droppable id, which Right reaches from the end of a row in the wide layout.
export const boardKeyboardCoordinates =
  (sideTargetId: UniqueIdentifier): KeyboardCoordinateGetter =>
  (
    event,
    {
      context: {
        active,
        over,
        collisionRect,
        droppableRects,
        droppableContainers,
      },
    },
  ) => {
    const direction = directions[event.code];
    if (!direction) {
      return undefined;
    }

    event.preventDefault();

    if (!active || !collisionRect) {
      return undefined;
    }

    const candidates: BoardTarget<UniqueIdentifier>[] = [];
    droppableContainers.getEnabled().forEach((entry) => {
      if (!entry || entry.disabled) {
        return;
      }
      const rect = droppableRects.get(entry.id);
      if (rect) {
        candidates.push({ id: entry.id, ...rect });
      }
    });

    // Measured from the target the chip is over, not the chip itself: the
    // chip sits inside its tile, so the tile would otherwise count as lying
    // in every direction from it. Before collision detection has named one,
    // that is the target holding the chip's centre.
    const chipX = collisionRect.left + collisionRect.width / 2;
    const chipY = collisionRect.top + collisionRect.height / 2;
    const current = candidates.find((target) => target.id === over?.id) ??
      candidates.find(
        (target) =>
          chipX >= target.left &&
          chipX <= target.left + target.width &&
          chipY >= target.top &&
          chipY <= target.top + target.height,
      ) ?? { id: null, ...collisionRect };

    const nextId = nextDropTarget(direction, current, candidates, sideTargetId);
    const newRect = nextId != null ? droppableRects.get(nextId) : undefined;
    if (!newRect) {
      return undefined;
    }

    // Land just inside the target's top-left so collision detection
    // resolves to that droppable.
    return { x: newRect.left + 8, y: newRect.top + 8 };
  };
