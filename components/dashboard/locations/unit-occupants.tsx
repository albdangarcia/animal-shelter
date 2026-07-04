"use client";

import { useState } from "react";
import type { BoardAnimal } from "@/app/lib/data/locations/shelter-board.data";
import { DraggableAnimalChip } from "./draggable-animal-chip";

const VISIBLE_LIMIT = 4;

interface Props {
  unitId: string;
  animals: BoardAnimal[];
  // Passed to each chip's hover-card as its current-location line.
  locationLabel: string;
}

// Occupant list for a unit tile. Shows at most VISIBLE_LIMIT occupants, then a
// "+N more" toggle reveals the rest. Chips are draggable so staff can move an
// animal to another unit or the Unplaced tray.
export const UnitOccupants = ({ unitId, animals, locationLabel }: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (animals.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">Empty</p>
    );
  }

  const hasOverflow = animals.length > VISIBLE_LIMIT;
  const visible = expanded ? animals : animals.slice(0, VISIBLE_LIMIT);
  const hiddenCount = animals.length - VISIBLE_LIMIT;

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((animal) => (
        <DraggableAnimalChip
          key={animal.id}
          animal={animal}
          fromUnitId={unitId}
          locationLabel={locationLabel}
        />
      ))}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="self-start rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-accent"
        >
          {expanded ? "Show less" : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
};
