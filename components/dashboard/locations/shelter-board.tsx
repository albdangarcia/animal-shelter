"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  IconBuildingWarehouse,
  IconHome,
  IconAlertTriangle,
  IconLoader2,
  IconStethoscope,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import type {
  BoardAnimal,
  BoardLocation,
  BoardUnit,
  FosteredBoardAnimal,
  ShelterBoardData,
} from "@/app/lib/data/locations/shelter-board.data";
import { moveAnimalToUnit } from "@/app/lib/actions/animal-placement.actions";
import { AnimalChip } from "./animal-chip";
import {
  DraggableAnimalChip,
  type AnimalDragData,
} from "./draggable-animal-chip";
import { UnitOccupants } from "./unit-occupants";
import { boardKeyboardCoordinates } from "./board-keyboard-coordinates";

// Droppable id for the Unplaced tray; every other droppable id is a unit id.
const UNPLACED_ID = "unplaced";

// Capacity states
type CapacityState = "empty" | "hasSpace" | "atCapacity" | "overCapacity";

const getCapacityState = (count: number, capacity: number): CapacityState => {
  if (count === 0) return "empty";
  if (count < capacity) return "hasSpace";
  if (count === capacity) return "atCapacity";
  return "overCapacity";
};

// Tile tint per state. Uses the app's Tailwind color convention (green/amber/red
// with dark: variants), matching notes/partner badges elsewhere.
const capacityTileClass: Record<CapacityState, string> = {
  empty:
    "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
  hasSpace: "border-border bg-card",
  atCapacity:
    "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  overCapacity:
    "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
};

const capacityRatioClass: Record<CapacityState, string> = {
  empty: "text-green-700 dark:text-green-300",
  hasSpace: "text-muted-foreground",
  atCapacity: "text-amber-700 dark:text-amber-300",
  overCapacity: "text-red-700 dark:text-red-300",
};

const legendItems: { state: CapacityState; label: string }[] = [
  { state: "empty", label: "Empty" },
  { state: "hasSpace", label: "Has space" },
  { state: "atCapacity", label: "At capacity" },
  { state: "overCapacity", label: "Over capacity" },
];

const legendDotClass: Record<CapacityState, string> = {
  empty: "bg-green-500",
  hasSpace: "bg-muted-foreground/40",
  atCapacity: "bg-amber-500",
  overCapacity: "bg-red-500",
};

// Optimistic move reducer
interface BoardMove {
  animalId: string;
  toUnitId: string | null; // null = Unplaced tray
}

// Pure reducer for useOptimistic: relocates one animal chip and recomputes the
// affected counts/totals so capacity colors update before the server responds.
const applyMoveToBoard = (
  board: ShelterBoardData,
  move: BoardMove,
): ShelterBoardData => {
  const targetExists =
    move.toUnitId === null ||
    board.locations.some((location) =>
      location.units.some((unit) => unit.id === move.toUnitId),
    );
  if (!targetExists) return board;

  // Remove the animal from wherever it currently sits.
  let moved: BoardAnimal | undefined;
  let unplaced = board.unplaced.filter((animal) => {
    if (animal.id !== move.animalId) return true;
    moved = animal;
    return false;
  });
  let locations = board.locations.map((location) => ({
    ...location,
    units: location.units.map((unit) => {
      const found = unit.animals.find((animal) => animal.id === move.animalId);
      if (!found) return unit;
      moved = found;
      return {
        ...unit,
        animals: unit.animals.filter((animal) => animal.id !== move.animalId),
      };
    }),
  }));

  if (!moved) return board;
  const animal = moved;

  // Insert at the target, keeping the server's name ordering so the
  // post-revalidate reconciliation doesn't reshuffle chips.
  const insertSorted = (list: BoardAnimal[]) =>
    [...list, animal].sort((a, b) => a.name.localeCompare(b.name));

  if (move.toUnitId === null) {
    unplaced = insertSorted(unplaced);
  } else {
    locations = locations.map((location) => ({
      ...location,
      units: location.units.map((unit) =>
        unit.id === move.toUnitId
          ? { ...unit, animals: insertSorted(unit.animals) }
          : unit,
      ),
    }));
  }

  const onSite = locations.reduce(
    (sum, location) =>
      sum +
      location.units.reduce(
        (unitSum, unit) => unitSum + unit.animals.length,
        0,
      ),
    0,
  );

  return {
    ...board,
    locations,
    unplaced,
    totals: { ...board.totals, onSite, unplaced: unplaced.length },
  };
};

// Pointer drags resolve by pointer position; keyboard drags have no pointer,
// so fall back to rect intersection against the snapped collision rect.
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

const getDragData = (active: Active | null): AnimalDragData | undefined =>
  active?.data.current as AnimalDragData | undefined;

// Summary strip
function MetricCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: typeof IconHome;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "@container/card gap-2 py-4",
        highlight &&
          value > 0 &&
          "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
      )}
    >
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-4" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
          {Math.round(value)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

// Unit tile
function UnitTile({
  unit,
  locationName,
}: {
  unit: BoardUnit;
  locationName: string;
}) {
  const count = unit.animals.length;
  const state = getCapacityState(count, unit.capacity);

  const { setNodeRef, isOver, active } = useDroppable({ id: unit.id });
  const dragData = getDragData(active);
  const isIncoming =
    isOver && dragData != null && dragData.fromUnitId !== unit.id;
  // Pre-drop hint only — dropping over capacity is always allowed.
  const wouldOverflow = isIncoming && count + 1 > unit.capacity;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        capacityTileClass[state],
        isIncoming &&
          (wouldOverflow
            ? "ring-2 ring-red-400 dark:ring-red-600"
            : "ring-2 ring-primary"),
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">{unit.name}</span>
        <span
          className={cn(
            "shrink-0 text-sm font-medium tabular-nums",
            capacityRatioClass[state],
          )}
        >
          {count}/{unit.capacity}
        </span>
      </div>
      <UnitOccupants
        unitId={unit.id}
        animals={unit.animals}
        locationLabel={`${unit.name} · ${locationName}`}
      />
    </div>
  );
}

// Location group
function LocationGroup({ location }: { location: BoardLocation }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{location.name}</h3>
        <Badge variant="secondary">
          {formatSingleEnumOption(location.type)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {location.units.length}{" "}
          {location.units.length === 1 ? "unit" : "units"}
        </span>
      </div>
      {location.units.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {location.units.map((unit) => (
            <UnitTile key={unit.id} unit={unit} locationName={location.name} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No units in this location yet.
        </p>
      )}
    </div>
  );
}

// Side column
function UnplacedTray({ animals }: { animals: ShelterBoardData["unplaced"] }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: UNPLACED_ID });
  const dragData = getDragData(active);
  const isIncoming = isOver && dragData != null && dragData.fromUnitId !== null;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
        isIncoming && "ring-2 ring-primary",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconAlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          Unplaced
          <Badge variant="secondary" className="ml-auto tabular-nums">
            {animals.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          On site but not assigned to a unit — needs attention.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {animals.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {animals.map((animal) => (
              <DraggableAnimalChip
                key={animal.id}
                animal={animal}
                fromUnitId={null}
                locationLabel="Unplaced"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No unplaced animals.</p>
        )}
      </CardContent>
    </Card>
  );
}

// Display-only row for a fostered animal — no draggable/droppable wiring
// placements are form-driven, not a board drag target.
function FosterRow({
  animal,
  canReadFosters,
}: {
  animal: FosteredBoardAnimal;
  canReadFosters: boolean;
}) {
  return (
    <Link
      href={`/dashboard/animals/${animal.id}`}
      className="flex flex-col gap-1 rounded-md border bg-background px-2 py-1.5 hover:bg-accent"
    >
      <AnimalChip animal={animal} />
      <p className="truncate pl-8 text-[10px] text-muted-foreground">
        With {canReadFosters ? animal.fosterPersonName : "a foster"} · since{" "}
        {formatDateOrNA(animal.since)}
      </p>
    </Link>
  );
}

function FosterCard({
  animals,
  canReadFosters,
}: {
  animals: FosteredBoardAnimal[];
  canReadFosters: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconHome className="size-4 text-muted-foreground" />
          In foster
          <Badge variant="outline" className="ml-auto tabular-nums">
            {animals.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Fostered animals aren&apos;t shown on the physical board.
        </CardDescription>
      </CardHeader>
      {animals.length > 0 && (
        <CardContent className="flex flex-col gap-1.5">
          {animals.map((animal) => (
            <FosterRow
              key={animal.id}
              animal={animal}
              canReadFosters={canReadFosters}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// Top-level layout
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up an animal, press space or enter. While dragging, use the arrow keys to move it to a unit or the Unplaced tray. Press space or enter again to drop it there, or press escape to cancel.",
};

interface Props {
  data: ShelterBoardData;
  // the fostering fact shows to every board viewer, but
  // the foster's identity is gated behind FOSTERS_READ.
  canReadFosters: boolean;
}

export const ShelterBoard = ({ data, canReadFosters }: Props) => {
  // Optimistic copy of the server-fetched board: a move renders immediately,
  // then reconciles to server truth when the action's revalidate lands (or
  // rolls back automatically if the action fails).
  const [board, applyMove] = useOptimistic(data, applyMoveToBoard);
  const [isPending, startTransition] = useTransition();
  const [activeAnimal, setActiveAnimal] = useState<BoardAnimal | null>(null);

  const { locations, unplaced, fostered, totals } = board;

  const sensors = useSensors(
    // Small activation distance so a plain click on a chip isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );

  const dropTargetLabel = useMemo(() => {
    const labels = new Map<UniqueIdentifier, string>([
      [UNPLACED_ID, "Unplaced"],
    ]);
    for (const location of locations) {
      for (const unit of location.units) {
        labels.set(unit.id, `${unit.name} in ${location.name}`);
      }
    }
    return (id: UniqueIdentifier) => labels.get(id) ?? "an unknown target";
  }, [locations]);

  const activeName = (active: Active) =>
    getDragData(active)?.animal.name ?? "the animal";

  const announcements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${activeName(active)}.`;
    },
    onDragOver({ active, over }) {
      return over
        ? `${activeName(active)} is over ${dropTargetLabel(over.id)}.`
        : `${activeName(active)} is no longer over a drop target.`;
    },
    onDragEnd({ active, over }) {
      return over
        ? `Moved ${activeName(active)} to ${dropTargetLabel(over.id)}.`
        : `Dropped ${activeName(active)}. No move was made.`;
    },
    onDragCancel({ active }) {
      return `Moving ${activeName(active)} was cancelled.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveAnimal(getDragData(event.active)?.animal ?? null);
  };

  const handleDragCancel = () => setActiveAnimal(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveAnimal(null);

    const { active, over } = event;
    if (!over) return;
    const dragData = getDragData(active);
    if (!dragData) return;

    const toUnitId = over.id === UNPLACED_ID ? null : String(over.id);
    if (dragData.fromUnitId === toUnitId) return;
    const { id: animalId, name } = dragData.animal;

    startTransition(async () => {
      applyMove({ animalId, toUnitId });
      try {
        const result = await moveAnimalToUnit(animalId, toUnitId);
        if (!result.success) {
          toast.error(result.message ?? `Failed to move ${name}.`);
        } else if (result.overCapacity) {
          toast.warning(
            `${result.unitLabel} is now over capacity — ${result.newCount}/${result.capacity}`,
          );
        }
      } catch (error) {
        console.error("Failed to move animal:", error);
        toast.error(`Failed to move ${name}.`);
      }
    });
  };

  return (
    <DndContext
      id="shelter-board"
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-4 @xl/main:grid-cols-4">
          <MetricCard
            label="Animals on site"
            value={totals.onSite}
            icon={IconStethoscope}
          />
          <MetricCard
            label="Units"
            value={totals.units}
            icon={IconBuildingWarehouse}
          />
          <MetricCard
            label="Unplaced"
            value={totals.unplaced}
            icon={IconAlertTriangle}
            highlight
          />
          <MetricCard
            label="In foster"
            value={totals.inFoster}
            icon={IconHome}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="font-medium">Capacity:</span>
          {legendItems.map((item) => (
            <span key={item.state} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  legendDotClass[item.state],
                )}
              />
              {item.label}
            </span>
          ))}
          {isPending && (
            <span className="ml-auto flex items-center gap-1">
              <IconLoader2 className="size-3 animate-spin" />
              Saving…
            </span>
          )}
        </div>

        {/* Board + side column */}
        <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_20rem] md:gap-6">
          <div className="flex flex-col gap-6">
            {locations.length > 0 ? (
              locations.map((location) => (
                <LocationGroup key={location.id} location={location} />
              ))
            ) : (
              <div className="rounded-lg border-2 border-dashed py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No locations have been created yet.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <UnplacedTray animals={unplaced} />
            <FosterCard animals={fostered} canReadFosters={canReadFosters} />
          </div>
        </div>
      </div>

      {/* The chip follows the pointer/keyboard focus; the in-place chip dims.
          No drop animation — the optimistic move already relocated the chip. */}
      <DragOverlay dropAnimation={null}>
        {activeAnimal ? (
          <AnimalChip
            animal={activeAnimal}
            className="pointer-events-none shadow-lg ring-1 ring-border"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
