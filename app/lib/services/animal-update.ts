import type { TransactionClient } from "@/app/lib/prisma";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatuses,
  lockAnimal,
} from "@/app/lib/data/application-status.data";
import {
  animalBreedIds,
  assertLiveTaxonomy,
} from "@/app/lib/services/animal-taxonomy";
import {
  careEpisodeOfferInMove,
  type CareEpisodeOffer,
} from "@/app/lib/services/care-episode";
import { findLiveUnitForPlacement } from "@/app/lib/services/unit-housing";
import { toAnimalData } from "@/app/lib/utils/animal-data";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { buildLocationChangeSummary } from "@/app/lib/utils/location-activity";
import type { AnimalEditFormOutput } from "@/app/lib/zod-schemas/animal.schemas";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
} from "@/prisma/generated/enums";

/**
 * Saving the Edit Animal Details form: the animal's own fields, its breeds
 * and colors, its listing status and its unit, with the activity a status
 * change or a move records.
 *
 * Like `animal-creation`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`, and returns the care episode a move into or out of
 * a medical unit offers someone who may manage medical care (`offersCare`),
 * or null.
 *
 * The listing status is immutable from this form for ARCHIVED and
 * PENDING_ADOPTION animals, so the check compares the submitted value with
 * the current one: the form disables the status select for those two and
 * re-submits the unchanged value, which must save.
 */
export const recordAnimalUpdate = async (
  tx: TransactionClient,
  {
    animalId,
    values,
    staffMemberId,
    offersCare,
  }: {
    animalId: string;
    values: AnimalEditFormOutput;
    staffMemberId: string | null | undefined;
    offersCare: boolean;
  },
): Promise<CareEpisodeOffer | null> => {
  const {
    animalName,
    estimatedBirthDate,
    sex,
    listingStatus,
    species: speciesId,
    breed: breedId,
    additionalBreeds: additionalBreedIds,
    primaryColor: primaryColorId,
    additionalColors: additionalColorIds,
    heightCm,
  } = values;

  const mapped = toAnimalData(values);

  // Full color set = primary + additionals, de-duped in case the primary
  // also appears in the additional list.
  const allColorIds = Array.from(
    new Set([primaryColorId, ...additionalColorIds]),
  );

  let offer: CareEpisodeOffer | null = null;

  // The update below writes the listing status back whether or not it
  // changed, so everything read here has to still be true when it does.
  // Recording an outcome archives the animal behind this same lock; read
  // without it, an outcome committing in between would be overwritten by
  // the status this form loaded before it, putting an animal that has
  // left back on the list.
  await lockAnimal(tx, animalId);
  const currentAnimal = await tx.animal.findUnique({
    where: { id: animalId },
    select: {
      listingStatus: true,
      publishedAt: true,
      currentUnitId: true,
      currentUnit: {
        select: { name: true, location: { select: { name: true } } },
      },
    },
  });

  if (!currentAnimal) {
    throw new NotFoundError("Animal not found.");
  }

  // One state check for the listing status. Staff may edit the descriptive
  // fields of an archived or pending-adoption record; the status itself is
  // immutable from this form. Because the form re-submits the current
  // (disabled) value, an unchanged status is the ordinary edit case and
  // must pass through untouched — only a real transition is rejected.
  if (listingStatus !== currentAnimal.listingStatus) {
    if (currentAnimal.listingStatus === AnimalListingStatus.ARCHIVED) {
      throw new ConflictError(
        "This animal is archived. To make it available again, please use the re-intake process."
      );
    }

    const isChangingToAvailable =
      listingStatus === AnimalListingStatus.PUBLISHED ||
      listingStatus === AnimalListingStatus.DRAFT;

    if (
      currentAnimal.listingStatus === AnimalListingStatus.PENDING_ADOPTION &&
      isChangingToAvailable
    ) {
      // Approved as the application effectively is: one approved during
      // an earlier stay, and adopted or closed by that stay's outcome,
      // still stores APPROVED and must not hold this animal. Derived
      // behind the animal lock taken above.
      const approvedApplications = await tx.adoptionApplication.findMany({
        where: {
          animalId: animalId,
          status: ApplicationStatus.APPROVED,
        },
        select: DERIVATION_APPLICATION_SELECT,
      });
      const statuses = await effectiveApplicationStatuses(
        approvedApplications,
        tx,
      );

      if ([...statuses.values()].includes(ApplicationStatus.APPROVED)) {
        throw new ConflictError(
          "Cannot change status. This animal has an approved adoption application. Please reject or withdraw the application first."
        );
      }
    } else if (
      listingStatus === AnimalListingStatus.ARCHIVED ||
      listingStatus === AnimalListingStatus.PENDING_ADOPTION
    ) {
      // A real transition into a status this form doesn't own. The message
      // is accurate now that it only fires on an actual change.
      throw new ConflictError(
        "Invalid Action: This status can only be set via the outcome or application approval process."
      );
    }
  }

  const isArchived =
    currentAnimal.listingStatus === AnimalListingStatus.ARCHIVED;

  // The species, its breeds and every color must exist and not be
  // deleted. An animal whose breed or color was deleted since its last
  // save has to swap it for a live one: the form no longer offers it.
  await assertLiveTaxonomy(tx, {
    speciesId,
    breedId,
    additionalBreedIds,
    primaryColorId,
    additionalColorIds,
  });

  // verify the chosen unit still exists and isn't
  // soft-deleted. Treat a stale/deleted unit as Unplaced rather than
  // erroring. Capacity is never enforced. Read behind the unit's lock, as
  // on create.
  let resolvedUnitId: string | null = null;
  let resolvedUnitLabel: {
    name: string;
    location: { name: string };
  } | null = null;
  // An archived animal has left the shelter and cannot occupy a unit. The
  // form disables the Location/Unit cascade for archived animals; don't
  // trust the client — coerce to Unplaced here regardless of what was
  // submitted.
  if (mapped.currentUnitId && !isArchived) {
    const unit = await findLiveUnitForPlacement(tx, mapped.currentUnitId);
    resolvedUnitId = unit?.id ?? null;
    resolvedUnitLabel = unit
      ? { name: unit.name, location: unit.location }
      : null;
  }

  let publishedAt = currentAnimal.publishedAt;
  if (
    listingStatus === AnimalListingStatus.PUBLISHED &&
    !currentAnimal.publishedAt
  ) {
    publishedAt = new Date();
  }

  await tx.animal.update({
    where: { id: animalId },
    data: {
      name: animalName,
      birthDate: estimatedBirthDate,
      sex: sex,
      size: mapped.size,
      description: mapped.description,
      // null genuinely clears the column now — a cleared field arrives
      // as null (never ""), so no more "" ? undefined : heightCm guard
      // that silently left a stale value in place.
      heightCm,
      listingStatus: listingStatus,
      publishedAt: publishedAt,
      currentUnit: resolvedUnitId
        ? { connect: { id: resolvedUnitId } }
        : { disconnect: true },
      species: { connect: { id: speciesId } },
      // Every breed the form holds, so an animal of two breeds keeps both.
      breeds: {
        set: animalBreedIds(breedId, additionalBreedIds).map((id) => ({ id })),
      },
      colors: { set: allColorIds.map((id) => ({ id })) },
      primaryColor: { connect: { id: primaryColorId } },
    },
  });

  if (currentAnimal.listingStatus !== listingStatus && staffMemberId) {
    await tx.animalActivityLog.create({
      data: {
        animalId: animalId,
        activityType: AnimalActivityType.STATUS_CHANGE,
        changedById: staffMemberId,
        changeSummary: `Listing status changed from ${currentAnimal.listingStatus} to ${listingStatus}.`,
      },
    });
  }

  // Log a relocation only when the unit actually changed. The edit action
  // writes no generic FIELD_UPDATE, so LOCATION_CHANGE is purely additive.
  if (currentAnimal.currentUnitId !== resolvedUnitId && staffMemberId) {
    await tx.animalActivityLog.create({
      data: {
        animalId: animalId,
        activityType: AnimalActivityType.LOCATION_CHANGE,
        changedById: staffMemberId,
        changeSummary: buildLocationChangeSummary(
          currentAnimal.currentUnit,
          resolvedUnitLabel
        ),
      },
    });
    // A failed read gives no offer and leaves the save be.
    if (offersCare) {
      offer = await careEpisodeOfferInMove(
        tx,
        animalId,
        currentAnimal.currentUnitId,
        resolvedUnitId,
      );
    }
  }

  return offer;
};
