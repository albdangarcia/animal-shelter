import { Prisma } from "@/prisma/generated/client";
import type { AnimalSize } from "@/prisma/generated/enums";
import type { TransactionClient } from "@/app/lib/prisma";
import { lockLiveLocation } from "@/app/lib/services/unit-housing";

/**
 * The names and parents the Settings catalogs (characteristics, species,
 * breeds, colors, locations, units) refuse.
 *
 * No two live rows share a name in any capitals: within its species for a
 * breed, within its location for a unit, and across the table for the rest.
 * Adding, renaming and restoring all ask the same finder below, so they refuse
 * the same names. A restore's refusal names the live row, whose capitals may
 * differ, and asks for it to be renamed or deleted first.
 *
 * A breed is added, moved or restored only under a live species, as a unit is
 * only in a live location. Both sides lock the species, the way `unit-housing`
 * locks a location: the breed side takes `FOR SHARE` and the species delete
 * takes `FOR NO KEY UPDATE`, so whichever comes second sees what the first
 * wrote.
 *
 * Each function runs inside the caller's `prisma.$transaction` (a finder may
 * also take the plain client) and returns the refusal to show, or null once
 * the row is written. No auth or `next/*` imports, so database tests drive it
 * directly.
 */

const restoreRefusal = (
  restoring: string,
  live: string,
  what: string,
  where = "",
) =>
  `Can't restore "${restoring}": ${what} named "${live}" already exists${where}. Rename or delete that one first.`;

export const BREED_SPECIES_DELETED =
  "Can't restore a breed of a deleted species. Restore the species first.";
export const UNIT_LOCATION_DELETED =
  "Can't restore a unit in a deleted location. Restore the location first.";
export const SPECIES_IN_USE =
  "This species can't be deleted because it still has breeds or animals associated with it.";
export const BREED_SPECIES_GONE = "The selected species no longer exists.";
export const BREED_NAME_TAKEN =
  "A breed with that name already exists for this species.";

// ── Finding a live row by name ───────────────────────────────────────────

type Db = Pick<TransactionClient, "$queryRaw">;
type Named = { id: string; name: string };

/**
 * The live row of `table` named `name` in any capitals, within `scope`, other
 * than `excludeId`. Compared with `lower()` in SQL, not Prisma's insensitive
 * `equals`: that is an `ILIKE`, which reads `_` and `%` in the name as
 * wildcards ("Tan_x" would match "Tanzx") and fails outright on a name ending
 * in a backslash.
 */
const findLiveNamed = async (
  db: Db,
  table: string,
  name: string,
  scope: Prisma.Sql,
  excludeId?: string,
): Promise<Named | null> => {
  const rows = await db.$queryRaw<Named[]>`
    SELECT id, name FROM ${Prisma.raw(table)}
    WHERE lower(name) = lower(${name})
      AND deleted_at IS NULL
      ${scope}
      ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
    LIMIT 1`;
  return rows[0] ?? null;
};

export const findLiveCharacteristicNamed = (
  db: Db,
  name: string,
  excludeId?: string,
) => findLiveNamed(db, "characteristics", name, Prisma.empty, excludeId);

export const findLiveColorNamed = (db: Db, name: string, excludeId?: string) =>
  findLiveNamed(db, "colors", name, Prisma.empty, excludeId);

export const findLiveSpeciesNamed = (
  db: Db,
  name: string,
  excludeId?: string,
) => findLiveNamed(db, "species", name, Prisma.empty, excludeId);

export const findLiveBreedNamed = (
  db: Db,
  name: string,
  speciesId: string,
  excludeId?: string,
) =>
  findLiveNamed(
    db,
    "breeds",
    name,
    Prisma.sql`AND species_id = ${speciesId}`,
    excludeId,
  );

export const findLiveLocationNamed = (
  db: Db,
  name: string,
  excludeId?: string,
) => findLiveNamed(db, "locations", name, Prisma.empty, excludeId);

export const findLiveUnitNamed = (
  db: Db,
  name: string,
  locationId: string,
  excludeId?: string,
) =>
  findLiveNamed(
    db,
    "units",
    name,
    Prisma.sql`AND location_id = ${locationId}`,
    excludeId,
  );

// ── Restores ─────────────────────────────────────────────────────────────

export const restoreCharacteristic = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.characteristic.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  const live = await findLiveCharacteristicNamed(tx, row.name, id);
  if (live) return restoreRefusal(row.name, live.name, "a characteristic");
  await tx.characteristic.update({ where: { id }, data: { deletedAt: null } });
  return null;
};

export const restoreColor = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.color.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  const live = await findLiveColorNamed(tx, row.name, id);
  if (live) return restoreRefusal(row.name, live.name, "a color");
  await tx.color.update({ where: { id }, data: { deletedAt: null } });
  return null;
};

export const restoreSpecies = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.species.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  const live = await findLiveSpeciesNamed(tx, row.name, id);
  if (live) return restoreRefusal(row.name, live.name, "a species");
  await tx.species.update({ where: { id }, data: { deletedAt: null } });
  return null;
};

// ── Breeds and their species ─────────────────────────────────────────────

/**
 * Holds a species for the rest of the transaction before a breed is added,
 * moved or restored under it, and says whether it is live.
 */
const lockLiveSpecies = async (tx: TransactionClient, speciesId: string) => {
  await tx.$queryRaw`SELECT id FROM species WHERE id = ${speciesId} FOR SHARE`;
  // Read after the lock: a delete that committed while this waited is only
  // visible to a statement that starts once the lock is held.
  const species = await tx.species.findUnique({
    where: { id: speciesId },
    select: { deletedAt: true },
  });
  return species !== null && species.deletedAt === null;
};

export type BreedValues = {
  name: string;
  speciesId: string;
  typicalSize: AnimalSize | null;
};

/** Adds a breed under a live species, unless the name is taken there. */
export const addBreed = async (
  tx: TransactionClient,
  values: BreedValues,
): Promise<string | null> => {
  if (!(await lockLiveSpecies(tx, values.speciesId))) return BREED_SPECIES_GONE;
  if (await findLiveBreedNamed(tx, values.name, values.speciesId)) {
    return BREED_NAME_TAKEN;
  }
  await tx.breed.create({ data: values });
  return null;
};

/**
 * Renames a breed, or moves it to another species, unless that species is
 * deleted or already has a live breed of the name.
 */
export const editBreed = async (
  tx: TransactionClient,
  id: string,
  values: BreedValues,
): Promise<string | null> => {
  if (!(await lockLiveSpecies(tx, values.speciesId))) return BREED_SPECIES_GONE;
  if (await findLiveBreedNamed(tx, values.name, values.speciesId, id)) {
    return BREED_NAME_TAKEN;
  }
  await tx.breed.update({ where: { id }, data: values });
  return null;
};

export const restoreBreed = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.breed.findUniqueOrThrow({
    where: { id },
    select: { name: true, speciesId: true },
  });
  if (!(await lockLiveSpecies(tx, row.speciesId))) return BREED_SPECIES_DELETED;
  const live = await findLiveBreedNamed(tx, row.name, row.speciesId, id);
  if (live) {
    return restoreRefusal(row.name, live.name, "a breed", " for this species");
  }
  await tx.breed.update({ where: { id }, data: { deletedAt: null } });
  return null;
};

/**
 * Soft-deletes a species unless a live breed or any animal still uses it.
 * Returns the refusal, and changes nothing, when one does. The breed count is
 * taken behind the species' lock, so a breed added, moved or restored at the
 * same moment is either counted or refused. (An animal added at the same
 * moment is not held off: adding an animal takes no lock on its species.)
 */
export const deleteSpeciesIfUnused = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  await tx.$queryRaw`SELECT id FROM species WHERE id = ${id} FOR NO KEY UPDATE`;
  const [breeds, animals] = await Promise.all([
    tx.breed.count({ where: { speciesId: id, deletedAt: null } }),
    tx.animal.count({ where: { speciesId: id } }),
  ]);
  if (breeds > 0 || animals > 0) return SPECIES_IN_USE;
  await tx.species.update({ where: { id }, data: { deletedAt: new Date() } });
  return null;
};

// ── Locations and units ──────────────────────────────────────────────────

export const restoreLocation = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.location.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  const live = await findLiveLocationNamed(tx, row.name, id);
  if (live) return restoreRefusal(row.name, live.name, "a location");
  await tx.location.update({ where: { id }, data: { deletedAt: null } });
  return null;
};

/**
 * Restores a unit unless its location is deleted or a live unit there has its
 * name. The location is checked behind its lock, like adding a unit (see
 * `unit-housing`). A unit's location never changes, so it is read without one.
 */
export const restoreUnit = async (
  tx: TransactionClient,
  id: string,
): Promise<string | null> => {
  const row = await tx.unit.findUniqueOrThrow({
    where: { id },
    select: { name: true, locationId: true },
  });
  if (!(await lockLiveLocation(tx, row.locationId))) {
    return UNIT_LOCATION_DELETED;
  }
  const live = await findLiveUnitNamed(tx, row.name, row.locationId, id);
  if (live) {
    return restoreRefusal(row.name, live.name, "a unit", " in this location");
  }
  await tx.unit.update({ where: { id }, data: { deletedAt: null } });
  return null;
};
