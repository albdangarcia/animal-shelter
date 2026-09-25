import type { TransactionClient } from "@/app/lib/prisma";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import { findLiveUnitForPlacement } from "@/app/lib/services/unit-housing";
import { toAnimalData } from "@/app/lib/utils/animal-data";
import { startOfShelterDay } from "@/app/lib/utils/shelter-day";
import type { CreateAnimalFormOutput } from "@/app/lib/zod-schemas/animal.schemas";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
} from "@/prisma/generated/enums";

/**
 * Creating an animal: the row, its first intake and the activity that
 * records them.
 *
 * Like `outcome-recording`, this module has no `next/*` and no auth imports,
 * so a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`. The intake is written in the same transaction as
 * the animal, so the timeline a new animal starts with is always one intake and
 * no outcome. That is what makes the listing safe to choose here: a draft or
 * published animal is here, and the schema refuses every other status.
 */
export const recordAnimalCreation = async (
  tx: TransactionClient,
  values: CreateAnimalFormOutput,
  staffMemberId: string,
): Promise<{ animalId: string }> => {
  const {
    animalName,
    estimatedBirthDate,
    sex,
    healthStatus,
    listingStatus,
    species: speciesId,
    breed: breedId,
    primaryColor: primaryColorId,
    additionalColors: additionalColorIds,
    intakeType,
    intakeDate,
    weightGrams,
    heightCm,
  } = values;

  const mapped = toAnimalData(values);

  // Full color set = primary + additionals, de-duped in case the primary
  // also appears in the additional list.
  const allColorIds = Array.from(
    new Set([primaryColorId, ...additionalColorIds]),
  );

  const speciesRecord = await tx.species.findUnique({
    where: { id: speciesId },
    select: { name: true },
  });

  if (!speciesRecord) {
    throw new Error("Invalid Species ID provided.");
  }

  // Guard: all submitted colors must exist and not be soft-deleted.
  const validColorCount = await tx.color.count({
    where: { id: { in: allColorIds }, deletedAt: null },
  });
  if (validColorCount !== allColorIds.length) {
    throw new Error("One or more selected colors are no longer available.");
  }

  // verify the chosen unit still exists and isn't
  // soft-deleted. Treat a stale/deleted unit as Unplaced rather than
  // erroring. Capacity is never enforced. Read behind the unit's lock, so
  // a delete of it at the same moment either sees this animal or is seen.
  let resolvedUnitId: string | null = null;
  let resolvedUnitLabel: {
    name: string;
    location: { name: string };
  } | null = null;
  if (mapped.currentUnitId) {
    const unit = await findLiveUnitForPlacement(tx, mapped.currentUnitId);
    resolvedUnitId = unit?.id ?? null;
    resolvedUnitLabel = unit
      ? { name: unit.name, location: unit.location }
      : null;
  }

  // Set publishedAt if listing status is PUBLISHED
  const publishedAt =
    listingStatus === AnimalListingStatus.PUBLISHED ? new Date() : null;

  const newAnimal = await tx.animal.create({
    data: {
      name: animalName,
      birthDate: estimatedBirthDate,
      sex: sex,
      size: mapped.size,
      description: mapped.description,
      // A fresh row has nothing to preserve, so null and undefined are
      // equivalent here — written directly now that these are real
      // nullable numbers rather than strings needing a truthy guard.
      currentWeightGrams: weightGrams,
      heightCm,
      healthStatus: healthStatus,
      listingStatus: listingStatus,
      publishedAt: publishedAt,
      microchipNumber: mapped.microchipNumber,
      isSpayedNeutered: mapped.isSpayedNeutered,
      currentUnit: resolvedUnitId
        ? { connect: { id: resolvedUnitId } }
        : undefined,
      species: { connect: { id: speciesId } },
      breeds: { connect: { id: breedId } },
      colors: { connect: allColorIds.map((id) => ({ id })) },
      primaryColor: { connect: { id: primaryColorId } },
    },
  });

  await tx.intake.create({
    data: {
      type: intakeType,
      intakeDate: intakeDate,
      notes: mapped.notes,
      animalId: newAnimal.id,
      staffMemberId: staffMemberId,
      sourcePartnerId:
        intakeType === IntakeType.TRANSFER_IN
          ? mapped.sourcePartnerId
          : undefined,
      surrenderingPersonId:
        intakeType === IntakeType.OWNER_SURRENDER
          ? mapped.surrenderingPersonId
          : undefined,
      foundAddress:
        intakeType === IntakeType.STRAY ? mapped.foundAddress : undefined,
      foundCity:
        intakeType === IntakeType.STRAY ? mapped.foundCity : undefined,
      foundState:
        intakeType === IntakeType.STRAY ? mapped.foundState : undefined,
    },
  });

  // A dated first data point with real provenance, rather than a bare
  // number with no history. See VitalsLog and recomputeCurrentWeight in
  // animal-vitals.actions.ts for the cache invariant this must respect —
  // safe to set currentWeightGrams directly here since this is the only
  // entry that will exist for this animal.
  if (weightGrams) {
    await tx.vitalsLog.create({
      data: {
        animalId: newAnimal.id,
        recordedById: staffMemberId,
        // A vitals log records an instant, and the intake supplies only a
        // day, so the weigh-in is placed at the moment that day begins on
        // the shelter's calendar. Nothing finer was recorded.
        recordedAt: startOfShelterDay(intakeDate, (await getShelterSettings()).timezone),
        weightGrams,
      },
    });
  }

  const intakeSummaryBase = `Animal was admitted as ${intakeType
    .replace(/_/g, " ")
    .toLowerCase()}`;
  // Intake is not a relocation and must not emit its own LOCATION_CHANGE
  // (that would double-log). If a unit was chosen at intake, note the
  // initial placement inline on this same summary instead.
  const intakeSummary = resolvedUnitLabel
    ? `${intakeSummaryBase}; placed in ${resolvedUnitLabel.location.name} · ${resolvedUnitLabel.name}.`
    : `${intakeSummaryBase}.`;

  await tx.animalActivityLog.create({
    data: {
      animalId: newAnimal.id,
      activityType: AnimalActivityType.INTAKE_PROCESSED,
      changedById: staffMemberId,
      changeSummary: intakeSummary,
    },
  });

  // Log status change if published
  if (listingStatus === AnimalListingStatus.PUBLISHED) {
    await tx.animalActivityLog.create({
      data: {
        animalId: newAnimal.id,
        activityType: AnimalActivityType.STATUS_CHANGE,
        changedById: staffMemberId,
        changeSummary: `Listing status changed to PUBLISHED.`,
      },
    });
  }

  return { animalId: newAnimal.id };
};
