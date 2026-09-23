// Pure core of the dashboard's global search. The database client is passed
// in, so this module never imports it and the unit tests can hand it a fake.
import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type {
  AnimalListingStatus,
  ApplicationStatus,
  PartnerType,
} from "@/prisma/generated/enums";
import {
  deriveApplicationStatuses,
  type EffectiveApplicationStatus,
} from "@/app/lib/utils/derive-application-status";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import { personSearchWhereClause } from "../people-directory/person-search";

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_GROUP_LIMIT = 5;

// A microchip lookup is an exact match, and only when the query could be one:
// a single token of at least this many characters.
const MICROCHIP_MIN_LENGTH = 9;

// Each group is gated by its own permission. A group the caller can't read is
// skipped rather than failing the whole search.
export const GLOBAL_SEARCH_GROUP_PERMISSIONS = {
  animals: AppPermissions.ANIMAL_INFO_READ,
  people: AppPermissions.PERSONS_READ,
  partners: AppPermissions.PARTNERS_READ,
  adoptionApplications: AppPermissions.APPLICATIONS_READ,
  fosterApplications: AppPermissions.FOSTERS_READ,
} as const satisfies Record<string, AppPermission>;

export type GlobalSearchGroup = keyof typeof GLOBAL_SEARCH_GROUP_PERMISSIONS;

// The five permissions above as a union. `SEARCH_PERMISSIONS` in
// `nav-links.config.ts` is checked against it, so the sidebar can't offer the
// palette on a permission this file doesn't actually search.
export type GlobalSearchPermission =
  (typeof GLOBAL_SEARCH_GROUP_PERMISSIONS)[GlobalSearchGroup];

export const GLOBAL_SEARCH_GROUPS = Object.keys(
  GLOBAL_SEARCH_GROUP_PERMISSIONS,
) as GlobalSearchGroup[];

export type AnimalHit = {
  id: string;
  name: string;
  species: string;
  breeds: string[];
  listingStatus: AnimalListingStatus;
};

export type PersonHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  hasAccount: boolean;
};

export type PartnerHit = {
  id: string;
  name: string;
  type: PartnerType;
  isActive: boolean;
};

export type AdoptionAppHit = {
  id: string;
  applicantName: string;
  animalName: string;
  status: EffectiveApplicationStatus;
};

export type FosterAppHit = {
  id: string;
  applicantName: string;
  status: ApplicationStatus;
};

// null = the caller may not see this group, so the palette hides it.
export type GlobalSearchResults = {
  animals: AnimalHit[] | null;
  people: PersonHit[] | null;
  partners: PartnerHit[] | null;
  adoptionApplications: AdoptionAppHit[] | null;
  fosterApplications: FosterAppHit[] | null;
};

export type GlobalSearchDb = Pick<
  typeof prisma,
  | "animal"
  | "person"
  | "partner"
  | "adoptionApplication"
  | "fosterApplication"
  | "outcome"
>;

const contains = (query: string) =>
  ({ contains: query, mode: "insensitive" }) as const;

export const animalSearchWhere = (query: string): Prisma.AnimalWhereInput => {
  const couldBeMicrochip =
    query.length >= MICROCHIP_MIN_LENGTH && !/\s/.test(query);

  return {
    OR: [
      { name: contains(query) },
      ...(couldBeMicrochip ? [{ microchipNumber: { equals: query } }] : []),
    ],
  };
};

export const partnerSearchWhere = (query: string): Prisma.PartnerWhereInput => ({
  OR: [
    { name: contains(query) },
    { email: contains(query) },
    { phone: contains(query) },
  ],
});

export const adoptionAppSearchWhere = (
  query: string,
): Prisma.AdoptionApplicationWhereInput => ({
  OR: [
    { applicantName: contains(query) },
    { applicantEmail: contains(query) },
    { animal: { name: contains(query) } },
  ],
});

export const fosterAppSearchWhere = (
  query: string,
): Prisma.FosterApplicationWhereInput => ({
  OR: [
    { applicantName: contains(query) },
    { applicantEmail: contains(query) },
  ],
});

export const emptyGlobalSearchResults = (
  groups: readonly GlobalSearchGroup[],
): GlobalSearchResults => {
  const allowed = new Set(groups);
  const emptyIfAllowed = (group: GlobalSearchGroup) =>
    allowed.has(group) ? [] : null;

  return {
    animals: emptyIfAllowed("animals"),
    people: emptyIfAllowed("people"),
    partners: emptyIfAllowed("partners"),
    adoptionApplications: emptyIfAllowed("adoptionApplications"),
    fosterApplications: emptyIfAllowed("fosterApplications"),
  };
};

// Runs one findMany per allowed group, in parallel. Groups that aren't allowed
// never reach the database. Expects a query that is already trimmed and
// validated; one shorter than the minimum returns empty groups.
export const runGlobalSearch = async (
  db: GlobalSearchDb,
  query: string,
  groups: readonly GlobalSearchGroup[],
): Promise<GlobalSearchResults> => {
  if (query.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
    return emptyGlobalSearchResults(groups);
  }

  const allowed = new Set(groups);
  const shared = {
    take: GLOBAL_SEARCH_GROUP_LIMIT,
    orderBy: { updatedAt: "desc" },
  } as const;

  const [animals, people, partners, adoptionApplications, fosterApplications] =
    await Promise.all([
      allowed.has("animals")
        ? db.animal
            .findMany({
              ...shared,
              where: animalSearchWhere(query),
              select: {
                id: true,
                name: true,
                listingStatus: true,
                species: { select: { name: true } },
                breeds: { select: { name: true }, orderBy: { name: "asc" } },
              },
            })
            .then((rows) =>
              rows.map(
                (row): AnimalHit => ({
                  id: row.id,
                  name: row.name,
                  species: row.species.name,
                  breeds: row.breeds.map((breed) => breed.name),
                  listingStatus: row.listingStatus,
                }),
              ),
            )
        : null,
      allowed.has("people")
        ? db.person
            .findMany({
              ...shared,
              where: personSearchWhereClause(query),
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                user: { select: { id: true } },
              },
            })
            .then((rows) =>
              rows.map(
                (row): PersonHit => ({
                  id: row.id,
                  name: row.name,
                  email: row.email,
                  phone: row.phone,
                  hasAccount: row.user !== null,
                }),
              ),
            )
        : null,
      allowed.has("partners")
        ? db.partner.findMany({
            ...shared,
            where: partnerSearchWhere(query),
            select: { id: true, name: true, type: true, isActive: true },
          })
        : null,
      allowed.has("adoptionApplications")
        ? db.adoptionApplication
            .findMany({
              ...shared,
              where: adoptionAppSearchWhere(query),
              select: {
                id: true,
                applicantName: true,
                status: true,
                submittedAt: true,
                animalId: true,
                animal: { select: { name: true } },
              },
            })
            .then(async (rows) => {
              // The badge is the application's effective status, which the
              // column alone cannot give: adopted and closed follow from the
              // animal's outcomes.
              const statuses = deriveApplicationStatuses(
                rows,
                rows.length === 0
                  ? []
                  : (
                      await db.outcome.findMany({
                        where: {
                          animalId: { in: rows.map((row) => row.animalId) },
                        },
                        select: {
                          animalId: true,
                          createdAt: true,
                          type: true,
                          adoptionApplicationId: true,
                        },
                      })
                    ).map((outcome) => ({ ...outcome, reversed: false })),
              );
              return rows.map(
                (row): AdoptionAppHit => ({
                  id: row.id,
                  applicantName: row.applicantName,
                  animalName: row.animal.name,
                  status: statuses.get(row.id)!,
                }),
              );
            })
        : null,
      allowed.has("fosterApplications")
        ? db.fosterApplication.findMany({
            ...shared,
            where: fosterAppSearchWhere(query),
            select: { id: true, applicantName: true, status: true },
          })
        : null,
    ]);

  return { animals, people, partners, adoptionApplications, fosterApplications };
};
