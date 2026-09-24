import type { TransactionClient } from "@/app/lib/prisma";

/**
 * What keeps an animal out of a deleted unit, and a live unit out of a deleted
 * location.
 *
 * Deleting a unit checks that no animal is housed in it and then marks it
 * deleted. Placing an animal checks that the unit is live and then writes the
 * animal's `currentUnitId`. Each is a read followed by a write, so without a
 * lock a placement committing between the delete's check and its write leaves
 * an animal housed in a deleted unit. A location and its units have the same
 * shape: deleting one checks it has no live unit, and adding or restoring a
 * unit checks the location is live.
 *
 * Both sides lock the parent row. The deleting side takes `FOR NO KEY UPDATE`,
 * the lock its own soft-delete takes. The placing side takes `FOR SHARE`,
 * which excludes it, so whichever comes second waits, and its next statement
 * reads what the first committed. Two placements in one unit share the lock
 * and go through side by side. A foreign key that only references the row (an
 * outcome or a foster placement recording the unit an animal left) takes
 * `FOR KEY SHARE`, which neither holds up. A lock on the placing side alone is
 * not enough: the delete's check can run first and see an empty unit, and the
 * placement then read the unit as still live.
 *
 * A path that also holds the animal (`lockAnimal`) takes it before the unit.
 * Nothing takes them the other way round: the delete locks no animal.
 *
 * Like `outcome-reversal`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. Each function runs inside the caller's
 * `prisma.$transaction`.
 */

/**
 * The unit an animal is about to be put in, held for the rest of the
 * transaction, or null when it or its location has been deleted. Every path
 * that writes a unit into `Animal.currentUnitId` reads the unit through this,
 * and writes in the same transaction.
 */
export const findLiveUnitForPlacement = async (
  tx: TransactionClient,
  unitId: string,
) => {
  await tx.$queryRaw`SELECT id FROM units WHERE id = ${unitId} FOR SHARE`;
  // Read after the lock, never before: a delete that committed while this
  // waited is only visible to a statement that starts once the lock is held.
  // Pickers leave out the units of a deleted location, so a stale form is
  // held to the same.
  return tx.unit.findFirst({
    where: { id: unitId, deletedAt: null, location: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      capacity: true,
      location: { select: { name: true } },
    },
  });
};

/**
 * Soft-deletes a unit unless an animal is housed in it. Returns false, and
 * changes nothing, when one is.
 */
export const deleteUnitIfEmpty = async (
  tx: TransactionClient,
  unitId: string,
): Promise<boolean> => {
  await tx.$queryRaw`SELECT id FROM units WHERE id = ${unitId} FOR NO KEY UPDATE`;
  const housed = await tx.animal.count({ where: { currentUnitId: unitId } });
  if (housed > 0) return false;
  await tx.unit.update({
    where: { id: unitId },
    data: { deletedAt: new Date() },
  });
  return true;
};

/**
 * Holds a location for the rest of the transaction before a unit is added to
 * it or restored in it, and says whether it is live.
 */
export const lockLiveLocation = async (
  tx: TransactionClient,
  locationId: string,
): Promise<boolean> => {
  await tx.$queryRaw`SELECT id FROM locations WHERE id = ${locationId} FOR SHARE`;
  const location = await tx.location.findUnique({
    where: { id: locationId },
    select: { deletedAt: true },
  });
  return location !== null && location.deletedAt === null;
};

/**
 * Soft-deletes a location unless it still has a live unit, empty or not.
 * Returns false, and changes nothing, when it does.
 */
export const deleteLocationIfEmpty = async (
  tx: TransactionClient,
  locationId: string,
): Promise<boolean> => {
  await tx.$queryRaw`SELECT id FROM locations WHERE id = ${locationId} FOR NO KEY UPDATE`;
  const units = await tx.unit.count({
    where: { locationId, deletedAt: null },
  });
  if (units > 0) return false;
  await tx.location.update({
    where: { id: locationId },
    data: { deletedAt: new Date() },
  });
  return true;
};

/**
 * Restores a soft-deleted unit unless its location is deleted. Returns false,
 * and changes nothing, when it is. A unit's location never changes, so it is
 * read without a lock.
 */
export const restoreUnitIfLocationLive = async (
  tx: TransactionClient,
  unitId: string,
): Promise<boolean> => {
  const unit = await tx.unit.findUniqueOrThrow({
    where: { id: unitId },
    select: { locationId: true },
  });
  if (!(await lockLiveLocation(tx, unit.locationId))) return false;
  await tx.unit.update({
    where: { id: unitId },
    data: { deletedAt: null },
  });
  return true;
};
