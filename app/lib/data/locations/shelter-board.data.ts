import prisma from "@/app/lib/prisma";
import type { LocationType, Sex } from "@/prisma/generated/enums";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

// Minimal per-animal payload rendered as an occupant/unplaced chip. Carries just
// enough identity for the chip (thumbnail + species) and its hover-card (breed,
// sex, age, profile link) — see components/dashboard/locations/animal-chip.tsx.
export interface BoardAnimal {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: Sex;
  birthDate: Date;
  thumbnailUrl: string | null; // first animal image, or null for the fallback glyph
}

export interface BoardUnit {
  id: string;
  name: string;
  capacity: number;
  animals: BoardAnimal[]; // animals where currentUnitId == unit.id, non-archived
}

export interface BoardLocation {
  id: string;
  name: string;
  type: LocationType;
  units: BoardUnit[];
}

// Bucket 2 chip, extended with the open placement's foster identity — display
// only no dnd-kit droppable/draggable wiring for this rail.
export interface FosteredBoardAnimal extends BoardAnimal {
  fosterPersonId: string;
  fosterPersonName: string;
  since: Date;
}

export interface ShelterBoardData {
  locations: BoardLocation[];
  unplaced: BoardAnimal[]; // bucket 3: no unit, no foster
  fostered: FosteredBoardAnimal[]; // bucket 2: no unit, in foster
  totals: {
    onSite: number; // sum of animals across all units (bucket 1)
    unplaced: number;
    inFoster: number;
    units: number;
  };
}

// Shared selection for the minimal chip payload.
const animalChipSelect = {
  id: true,
  name: true,
  sex: true,
  birthDate: true,
  species: { select: { name: true } },
  breeds: { select: { name: true }, take: 1, orderBy: { name: "asc" } },
  animalImages: {
    select: { url: true },
    take: 1,
    orderBy: { createdAt: "asc" },
  },
} as const;

const toBoardAnimal = (animal: {
  id: string;
  name: string;
  sex: Sex;
  birthDate: Date;
  species: { name: string };
  breeds: { name: string }[];
  animalImages: { url: string }[];
}): BoardAnimal => ({
  id: animal.id,
  name: animal.name,
  sex: animal.sex,
  birthDate: animal.birthDate,
  species: animal.species.name,
  breed: animal.breeds[0]?.name ?? null,
  thumbnailUrl: animal.animalImages[0]?.url ?? null,
});

const _fetchShelterBoard = async (): Promise<ShelterBoardData> => {
  try {
    // Live board: exclude soft-deleted locations/units and archived animals
    // everywhere. Occupancy is always derived from currentUnitId, there is no
    // stored occupancy field.
    const [locationRows, unplacedRows, fosteredRows] = await Promise.all([
      // locations -> units -> placed animals, in one query
      prisma.location.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          units: {
            where: { deletedAt: null },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              capacity: true,
              animals: {
                where: { listingStatus: { not: "ARCHIVED" } },
                orderBy: { name: "asc" },
                select: animalChipSelect,
              },
            },
          },
        },
      }),
      // bucket 3 — unplaced: no unit, no open foster placement
      prisma.animal.findMany({
        where: {
          currentUnitId: null,
          fosterPlacements: { none: { endDate: null } },
          listingStatus: { not: "ARCHIVED" },
        },
        orderBy: { name: "asc" },
        select: animalChipSelect,
      }),
      // bucket 2 — in foster: no unit, has an open foster placement
      prisma.animal.findMany({
        where: {
          currentUnitId: null,
          fosterPlacements: { some: { endDate: null } },
          listingStatus: { not: "ARCHIVED" },
        },
        orderBy: { name: "asc" },
        select: {
          ...animalChipSelect,
          fosterPlacements: {
            where: { endDate: null },
            select: {
              startDate: true,
              fosterProfile: {
                select: { person: { select: { id: true, name: true } } },
              },
            },
            take: 1,
          },
        },
      }),
    ]);

    const locations: BoardLocation[] = locationRows.map((location) => ({
      id: location.id,
      name: location.name,
      type: location.type,
      units: location.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        capacity: unit.capacity,
        animals: unit.animals.map(toBoardAnimal),
      })),
    }));

    const unplaced = unplacedRows.map(toBoardAnimal);

    // Every row here matched `fosterPlacements: { some: { endDate: null } }`,
    // so `fosterPlacements[0]` is always present.
    const fostered: FosteredBoardAnimal[] = fosteredRows.map((animal) => {
      const placement = animal.fosterPlacements[0];
      return {
        ...toBoardAnimal(animal),
        fosterPersonId: placement.fosterProfile.person.id,
        fosterPersonName: placement.fosterProfile.person.name,
        since: placement.startDate,
      };
    });

    const onSite = locations.reduce(
      (sum, location) =>
        sum +
        location.units.reduce(
          (unitSum, unit) => unitSum + unit.animals.length,
          0,
        ),
      0,
    );
    const unitCount = locations.reduce(
      (sum, location) => sum + location.units.length,
      0,
    );

    return {
      locations,
      unplaced,
      fostered,
      totals: {
        onSite,
        unplaced: unplaced.length,
        inFoster: fostered.length,
        units: unitCount,
      },
    };
  } catch (error) {
    console.error("Failed to fetch shelter board:", error);
    throw new Error("Could not fetch the shelter board.");
  }
};

export const fetchShelterBoard = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(_fetchShelterBoard);
