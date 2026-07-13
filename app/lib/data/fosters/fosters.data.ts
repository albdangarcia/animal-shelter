import { prisma } from "@/app/lib/prisma";
import { AnimalListingStatus, FosterStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { computeStays, type StayEvent } from "@/app/lib/utils/stay-utils";

export type FosterPickerOption = {
  id: string;
  personName: string;
  maxAnimals: number;
  openPlacementsCount: number;
};

// Only ACTIVE profiles with remaining capacity (open < max) — the same
// preconditions createFosterPlacement enforces, so nothing shown here can be
// rejected by the action for a capacity/status reason.
const _fetchFostersForPicker = async (): Promise<FosterPickerOption[]> => {
  try {
    const profiles = await prisma.fosterProfile.findMany({
      where: { status: FosterStatus.ACTIVE },
      select: {
        id: true,
        maxAnimals: true,
        person: { select: { name: true } },
        _count: { select: { placements: { where: { endDate: null } } } },
      },
      orderBy: { person: { name: "asc" } },
    });

    return profiles
      .map((profile) => ({
        id: profile.id,
        personName: profile.person.name,
        maxAnimals: profile.maxAnimals,
        openPlacementsCount: profile._count.placements,
      }))
      .filter((profile) => profile.openPlacementsCount < profile.maxAnimals);
  } catch (error) {
    console.error("Error fetching fosters for picker.", error);
    throw new Error("Error fetching fosters for picker.");
  }
};

// The combobox falls back to thumbnail + age + breed, and a short cuid
// fragment as the last resort for rows that would otherwise render identically.
export type FosterableAnimalOption = {
  id: string;
  name: string;
  speciesName: string;
  breed: string | null;
  birthDate: Date;
  thumbnailUrl: string | null; // first animal image, or null for the fallback glyph
};

// Animals with no open foster placement, filtered to ones actually in care —
// derived the same way as the rest of the app (see stay-utils), not from
// listingStatus alone. PERF: O(candidates) in memory, acceptable at this
// shelter's scale (mirrors the same tradeoff in reports/report-shared.data.ts).
// Payload shape mirrors the shelter-board `animalChipSelect` (minus `sex`,
// which the placement combobox doesn't need) so animal identity renders
// consistently across the app.
const _fetchAnimalsEligibleForFosterPlacement = async (): Promise<
  FosterableAnimalOption[]
> => {
  try {
    const animals = await prisma.animal.findMany({
      where: {
        listingStatus: { not: AnimalListingStatus.ARCHIVED },
        fosterPlacements: { none: { endDate: null } },
      },
      select: {
        id: true,
        name: true,
        birthDate: true,
        species: { select: { name: true } },
        breeds: { select: { name: true }, take: 1, orderBy: { name: "asc" } },
        animalImages: {
          select: { url: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
        intake: { select: { intakeDate: true } },
        Outcome: { select: { outcomeDate: true } },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();
    return animals
      .filter((animal) => {
        const events: StayEvent[] = [
          ...animal.intake.map(
            (intake): StayEvent => ({
              kind: "intake",
              date: intake.intakeDate,
            }),
          ),
          ...animal.Outcome.map(
            (outcome): StayEvent => ({
              kind: "outcome",
              date: outcome.outcomeDate,
            }),
          ),
        ];
        return computeStays(events, now).isInCare;
      })
      .map((animal) => ({
        id: animal.id,
        name: animal.name,
        speciesName: animal.species.name,
        breed: animal.breeds[0]?.name ?? null,
        birthDate: animal.birthDate,
        thumbnailUrl: animal.animalImages[0]?.url ?? null,
      }));
  } catch (error) {
    console.error(
      "Error fetching animals eligible for foster placement.",
      error,
    );
    throw new Error("Error fetching animals eligible for foster placement.");
  }
};

export type AnimalForFosterPlacement = {
  id: string;
  name: string;
  listingStatus: AnimalListingStatus;
  currentUnitId: string | null;
  isInCare: boolean;
  hasOpenPlacement: boolean;
};

// Single-animal lookup for the "animal fixed" entry point (from the animal
// page). Surfaces the same in-care/open-placement facts the action itself
// checks, so the page can show a friendly blocked message instead of a form
// that's guaranteed to fail.
const _fetchAnimalForFosterPlacement = async (
  animalId: string,
): Promise<AnimalForFosterPlacement | null> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) {
    throw new Error("Invalid animal ID format.");
  }

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        name: true,
        listingStatus: true,
        currentUnitId: true,
        intake: { select: { intakeDate: true } },
        Outcome: { select: { outcomeDate: true } },
        fosterPlacements: { where: { endDate: null }, select: { id: true } },
      },
    });

    if (!animal) return null;

    const events: StayEvent[] = [
      ...animal.intake.map(
        (intake): StayEvent => ({ kind: "intake", date: intake.intakeDate }),
      ),
      ...animal.Outcome.map(
        (outcome): StayEvent => ({
          kind: "outcome",
          date: outcome.outcomeDate,
        }),
      ),
    ];

    return {
      id: animal.id,
      name: animal.name,
      listingStatus: animal.listingStatus,
      currentUnitId: animal.currentUnitId,
      isInCare: computeStays(events, new Date()).isInCare,
      hasOpenPlacement: animal.fosterPlacements.length > 0,
    };
  } catch (error) {
    console.error("Error fetching animal for foster placement.", error);
    throw new Error("Error fetching animal for foster placement.");
  }
};

export type FosterProfileForPlacement = {
  id: string;
  status: FosterStatus;
  maxAnimals: number;
  openPlacementsCount: number;
  personId: string;
  personName: string;
};

// Single-profile lookup for the "foster fixed" entry point.
const _fetchFosterProfileForPlacement = async (
  fosterProfileId: string,
): Promise<FosterProfileForPlacement | null> => {
  const parsedId = cuidSchema.safeParse(fosterProfileId);
  if (!parsedId.success) {
    throw new Error("Invalid foster profile ID format.");
  }

  try {
    const profile = await prisma.fosterProfile.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        status: true,
        maxAnimals: true,
        personId: true,
        person: { select: { name: true } },
        _count: { select: { placements: { where: { endDate: null } } } },
      },
    });

    if (!profile) return null;

    return {
      id: profile.id,
      status: profile.status,
      maxAnimals: profile.maxAnimals,
      openPlacementsCount: profile._count.placements,
      personId: profile.personId,
      personName: profile.person.name,
    };
  } catch (error) {
    console.error("Error fetching foster profile for placement.", error);
    throw new Error("Error fetching foster profile for placement.");
  }
};

// Return / convert forms

export type FosterPlacementForAction = Prisma.FosterPlacementGetPayload<{
  include: {
    animal: { select: { id: true; name: true } };
    fosterProfile: {
      include: { person: { select: { id: true; name: true } } };
    };
    previousUnit: {
      include: { location: { select: { id: true; name: true } } };
    };
  };
}>;

// Shared by both the return and convert forms/pages — both act on a single
// placement identified by id.
const _fetchFosterPlacementById = async (
  placementId: string,
): Promise<FosterPlacementForAction | null> => {
  const parsedId = cuidSchema.safeParse(placementId);
  if (!parsedId.success) {
    throw new Error("Invalid foster placement ID format.");
  }

  try {
    return await prisma.fosterPlacement.findUnique({
      where: { id: parsedId.data },
      include: {
        animal: { select: { id: true, name: true } },
        fosterProfile: {
          include: { person: { select: { id: true, name: true } } },
        },
        previousUnit: {
          include: { location: { select: { id: true, name: true } } },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching foster placement.", error);
    throw new Error("Error fetching foster placement.");
  }
};

// Roster table

const fosterRosterInclude = {
  person: { select: { id: true, name: true, email: true, phone: true } },
  speciesCapabilities: { select: { id: true, name: true } },
  _count: { select: { placements: { where: { endDate: null } } } },
  placements: {
    where: { endDate: null },
    select: { animal: { select: { id: true, name: true } } },
  },
} satisfies Prisma.FosterProfileInclude;

export type FosterRosterListItem = Prisma.FosterProfileGetPayload<{
  include: typeof fosterRosterInclude;
}>;

const fetchFostersSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  pageSize: pageSizeSchema,
  status: z.string().optional(),
  species: z.string().optional(),
  capacity: z.string().optional(),
});

const _fetchFosters = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  pageSizeInput: number,
  statusInput?: string,
  speciesInput?: string,
  capacityInput?: string,
): Promise<{
  fosters: FosterRosterListItem[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = fetchFostersSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    pageSize: pageSizeInput,
    status: statusInput,
    species: speciesInput,
    capacity: capacityInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching fosters.");
  }

  const { query, currentPage, sort, pageSize, status, species, capacity } =
    validatedArgs.data;
  const offset = (currentPage - 1) * pageSize;

  const orderBy: Prisma.FosterProfileOrderByWithRelationInput = (() => {
    if (!sort) return { person: { name: "asc" } };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "personName":
        return { person: { name: dir } };
      case "status":
        return { status: dir };
      default:
        return { person: { name: "asc" } };
    }
  })();

  const whereClause: Prisma.FosterProfileWhereInput = {
    person: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
  };

  if (status) {
    const statuses = status.split(",").filter(Boolean) as FosterStatus[];
    if (statuses.length > 0) {
      whereClause.status = { in: statuses };
    }
  }

  if (species) {
    const speciesIds = species.split(",").filter(Boolean);
    if (speciesIds.length > 0) {
      whereClause.speciesCapabilities = { some: { id: { in: speciesIds } } };
    }
  }

  try {
    // "Available" capacity means status ACTIVE AND open
    // placements < maxAnimals — a filtered relation count compared to a
    // column, which Prisma can't express inside `where`. Two-step instead:
    // pull every profile matching the other filters (cheap at this
    // shelter's scale — same tradeoff as
    // _fetchAnimalsEligibleForFosterPlacement above), filter in memory, then
    // paginate that already-filtered list rather than the database.
    if (capacity === "available") {
      const candidates = await prisma.fosterProfile.findMany({
        where: { ...whereClause, status: FosterStatus.ACTIVE },
        include: fosterRosterInclude,
        orderBy,
      });

      const available = candidates.filter(
        (profile) => profile._count.placements < profile.maxAnimals,
      );

      const totalRows = available.length;
      const totalPages = Math.ceil(totalRows / pageSize);
      const fosters = available.slice(offset, offset + pageSize);

      return { fosters, totalPages, totalRows };
    }

    const [fosters, count] = await Promise.all([
      prisma.fosterProfile.findMany({
        where: whereClause,
        include: fosterRosterInclude,
        orderBy,
        take: pageSize,
        skip: offset,
      }),
      prisma.fosterProfile.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(count / pageSize);

    return { fosters, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching fosters.", error);
    throw new Error("Error fetching fosters.");
  }
};

export const fetchFosters = RequirePermission(AppPermissions.FOSTERS_READ)(
  _fetchFosters,
);

// Fostering tab

const fosterProfileForTabInclude = {
  speciesCapabilities: { select: { id: true, name: true } },
  placements: {
    orderBy: { startDate: "desc" },
    include: { animal: { select: { id: true, name: true } } },
  },
} satisfies Prisma.FosterProfileInclude;

export type FosterProfileForTab = Prisma.FosterProfileGetPayload<{
  include: typeof fosterProfileForTabInclude;
}>;

// Includes every placement (open and closed), most recent first — the tab
// derives the "current placement(s)" card from the open ones and the
// "history" card from the rest, rather than issuing two separate queries.
const _fetchFosterProfileByPersonId = async (
  personId: string,
): Promise<FosterProfileForTab | null> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  try {
    return await prisma.fosterProfile.findUnique({
      where: { personId: parsedId.data },
      include: fosterProfileForTabInclude,
    });
  } catch (error) {
    console.error("Error fetching foster profile by person ID.", error);
    throw new Error("Error fetching foster profile by person ID.");
  }
};

export const fetchFosterProfileByPersonId = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFosterProfileByPersonId);

export const fetchFostersForPicker = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFostersForPicker);

export const fetchAnimalsEligibleForFosterPlacement = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchAnimalsEligibleForFosterPlacement);

export const fetchAnimalForFosterPlacement = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchAnimalForFosterPlacement);

export const fetchFosterProfileForPlacement = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFosterProfileForPlacement);

export const fetchFosterPlacementById = RequirePermission(
  AppPermissions.FOSTERS_READ,
)(_fetchFosterPlacementById);
