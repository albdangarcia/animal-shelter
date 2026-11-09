import type { TransactionClient } from "@/app/lib/prisma";
import { AnimalActivityType } from "@/prisma/generated/enums";

const listNames = (names: string[]) => names.join(", ");

/**
 * The manual path for an animal's traits: reconciles its assigned
 * characteristics against the set staff picked on the Characteristics tab.
 *
 * It diffs the target against the animal's currently-active assignments and
 * records provenance. A newly-assigned trait gets an `AnimalCharacteristic`
 * row stamped with the acting user and the current time; an un-assigned trait
 * is soft-removed (`removedAt` / `removedById`) rather than deleted, so
 * "removed by X on date Y" survives. Re-assigning a previously-removed trait
 * clears the removal on the same row — the `(animalId, characteristicId)`
 * unique key means there is only ever one. A trait whose catalog entry has
 * been retired is never removed here (the tab doesn't show it, so it's never
 * in the submitted set).
 *
 * A trait assigned here has no source: both `sourceAssessmentId` and
 * `sourceConditionId` are reset to null on a re-assignment. A live finding
 * arguing against it shows as a warning on the Characteristics tab; it never
 * blocks the save.
 *
 * No `next/*` and no auth imports, so the database tests can drive it. It
 * runs inside the caller's `prisma.$transaction`.
 */
export async function reconcileAnimalCharacteristics(
  tx: TransactionClient,
  { animalId, characteristicIds }: { animalId: string; characteristicIds: string[] },
  personId: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // One read after another: a transaction is one connection.
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: {
      animalCharacteristics: {
        where: { removedAt: null },
        select: {
          characteristicId: true,
          characteristic: { select: { name: true, deletedAt: true } },
        },
      },
    },
  });
  const catalog = await tx.characteristic.findMany({
    where: { id: { in: characteristicIds } },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!animal) {
    throw new Error("Animal not found.");
  }

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  if (characteristicIds.some((id) => catalogById.get(id)?.deletedAt !== null)) {
    return {
      ok: false,
      message:
        "One or more characteristics are no longer available and cannot be assigned.",
    };
  }

  const activeIds = new Set(
    animal.animalCharacteristics.map((ac) => ac.characteristicId),
  );
  const target = new Set(characteristicIds);
  const toAdd = characteristicIds
    .filter((id) => !activeIds.has(id))
    .map((id) => ({
      characteristicId: id,
      characteristicName: catalogById.get(id)!.name,
    }));
  const toRemove = animal.animalCharacteristics
    .filter(
      (ac) => !ac.characteristic.deletedAt && !target.has(ac.characteristicId),
    )
    .map((ac) => ({
      characteristicId: ac.characteristicId,
      characteristicName: ac.characteristic.name,
    }));

  for (const { characteristicId } of toAdd) {
    await tx.animalCharacteristic.upsert({
      where: {
        animalId_characteristicId: { animalId, characteristicId },
      },
      create: {
        animalId,
        characteristicId,
        assignedById: personId,
        assignedAt: now,
      },
      // A row already exists only when this trait was previously removed;
      // reactivate it and re-stamp the provenance for this manual action.
      update: {
        assignedById: personId,
        assignedAt: now,
        sourceAssessmentId: null,
        sourceConditionId: null,
        removedAt: null,
        removedById: null,
      },
    });
  }

  if (toRemove.length > 0) {
    await tx.animalCharacteristic.updateMany({
      where: {
        animalId,
        characteristicId: { in: toRemove.map((t) => t.characteristicId) },
        removedAt: null,
      },
      data: { removedAt: now, removedById: personId },
    });
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { ok: true };
  }

  const names = (traits: { characteristicName: string }[]) =>
    listNames(traits.map((t) => t.characteristicName));
  const parts = [
    toAdd.length > 0 && `added ${names(toAdd)}`,
    toRemove.length > 0 && `removed ${names(toRemove)}`,
  ].filter(Boolean);

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.FIELD_UPDATE,
      changedById: personId,
      changeSummary: `Characteristics updated: ${parts.join("; ")}.`,
    },
  });
  return { ok: true };
}
