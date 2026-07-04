"use client";

import { useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { IconMapPin, IconExternalLink } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { calculateAgeString } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import type { BoardAnimal } from "@/app/lib/data/locations/shelter-board.data";
import { AnimalChip, getInitials } from "./animal-chip";

export interface AnimalDragData {
  animal: BoardAnimal;
  fromUnitId: string | null; // null = dragged from the Unplaced tray
}

interface Props {
  animal: BoardAnimal;
  fromUnitId: string | null;
  // Human-readable current location shown in the hover-card, e.g.
  // "A-1 · Dog block A" for a placed animal or "Unplaced" for the tray.
  locationLabel: string;
}

// On-demand identity peek: a larger thumbnail plus the key details staff need to
// confirm which animal a chip is, and a link to the full profile.
const AnimalHoverContent = ({
  animal,
  locationLabel,
}: {
  animal: BoardAnimal;
  locationLabel: string;
}) => {
  const speciesBreed = animal.breed
    ? `${animal.species} · ${animal.breed}`
    : animal.species;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-14 shrink-0 rounded-md">
          {animal.thumbnailUrl && (
            <AvatarImage
              src={animal.thumbnailUrl}
              alt=""
              className="object-cover"
            />
          )}
          <AvatarFallback className="rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">
            {getInitials(animal.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {animal.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {speciesBreed}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Sex</dt>
        <dd className="font-medium">{formatSingleEnumOption(animal.sex)}</dd>
        <dt className="text-muted-foreground">Age</dt>
        <dd className="font-medium">
          {calculateAgeString({ birthDate: new Date(animal.birthDate), simple: true })}
        </dd>
      </dl>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconMapPin className="size-3.5 shrink-0" />
        <span className="truncate">{locationLabel}</span>
      </p>

      <Link
        href={`/dashboard/animals/${animal.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        View full profile
        <IconExternalLink className="size-3.5" />
      </Link>
    </div>
  );
};

// Drag handle around the presentational AnimalChip. The bare chip stays
// separate so the DragOverlay can render it without draggable behavior.
export const DraggableAnimalChip = ({ animal, fromUnitId, locationLabel }: Props) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: animal.id,
    data: { animal, fromUnitId } satisfies AnimalDragData,
  });

  // Hover opens the peek; dragging is press-and-move, so the two don't conflict.
  // While a drag is active we render `open=false` so the card never lingers over
  // the moving chip; Radix's own onOpenChange (pointer leave / blur) resets the
  // state, so it doesn't spring back open after a drop.
  const [open, setOpen] = useState(false);

  return (
    <HoverCard
      open={isDragging ? false : open}
      onOpenChange={setOpen}
      openDelay={200}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          className={cn(
            "cursor-grab touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDragging && "opacity-40",
          )}
        >
          <AnimalChip animal={animal} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-64">
        <AnimalHoverContent animal={animal} locationLabel={locationLabel} />
      </HoverCardContent>
    </HoverCard>
  );
};
