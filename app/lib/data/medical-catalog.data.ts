import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { hasPermission } from "../auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { AnimalListingStatus, type Sex } from "@/prisma/generated/enums";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { getShelterSettings, getShelterToday } from "./shelter-settings.data";
import {
  findActiveVetClinics,
  findMedicalCatalog,
  findMedicalEntryFormItems,
  type MedicalCatalogItem,
  type MedicalEntryFormItem,
} from "./medical-catalog";
import type { CalendarDay } from "../utils/shelter-day";
import type { WeightUnitSystem } from "../utils/shelter-settings";
import { spayNeuterStatus } from "../utils/spay-neuter";
import { findSpayNeuterEntries } from "./animals/medical-status";
import {
  fetchConditionFormChoices,
  type ConditionFormChoices,
} from "./animals/medical-condition.data";
import {
  fetchMedicationOrderFormOptions,
  type MedicationOrderFormOptions,
} from "./animals/medication.data";

export type {
  MedicalBatchItem,
  MedicalCatalogItem,
  MedicalEntryFormItem,
  PickableMedicalItem,
} from "./medical-catalog";

const _fetchMedicalCatalog = async (): Promise<MedicalCatalogItem[]> => {
  try {
    // Management view: retired items included, so admins can unretire them.
    return await findMedicalCatalog(prisma);
  } catch (error) {
    console.error("Failed to fetch medical catalog:", error);
    throw new Error("Could not fetch the medical catalog.");
  }
};

export const fetchMedicalCatalog = RequirePermission(
  AppPermissions.MEDICAL_SETTINGS_MANAGE,
)(_fetchMedicalCatalog);

// The species an item can be limited to. Live species only: a retired one
// already on an item still shows on that item.
const _fetchMedicalCatalogSpecies = async () => {
  try {
    return await prisma.species.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch (error) {
    console.error("Failed to fetch species for the medical catalog:", error);
    throw new Error("Could not fetch species.");
  }
};

export const fetchMedicalCatalogSpecies = RequirePermission(
  AppPermissions.MEDICAL_SETTINGS_MANAGE,
)(_fetchMedicalCatalogSpecies);

export interface MedicalEntryFormOptions {
  /** The items staff can pick for this animal, every kind. */
  items: MedicalEntryFormItem[];
  /**
   * Items of the animal's open scheduled care that can't be picked for new
   * entries any more (retired, or narrowed to other species). That care is
   * still recorded with its own item.
   */
  scheduledItems: MedicalEntryFormItem[];
  /**
   * Whether the animal is in the shelter's care. Care already scheduled can
   * still be recorded after it leaves, but nothing new is scheduled for it,
   * so recording doesn't offer the next dose.
   */
  inCare: boolean;
  /**
   * The animal's sex, which decides whether a spay or a neuter can be picked
   * for it.
   */
  sex: Sex;
  /**
   * Whether the animal is spayed or neutered on its record. Then it can't be
   * exempt, so no exemption is offered.
   */
  altered: boolean;
  /** Active vet clinics. */
  vetClinics: { id: string; name: string }[];
  /** The shelter's today: the date given starts there, and can't pass it. */
  today: CalendarDay;
  /** The shelter's units, for the vitals an exam measures. */
  weightUnitSystem: WeightUnitSystem;
}

// What the entry forms offer for one animal. Behind MEDICAL_ADMINISTER, not
// the catalog's admin permission: staff giving care read the catalog, they
// don't manage it. Every role that may plan care may also give it, so the
// planning forms can rely on this too.
const _fetchMedicalEntryFormOptions = async (
  animalId: string,
): Promise<MedicalEntryFormOptions> => {
  const id = cuidSchema.safeParse(animalId);
  if (!id.success) {
    throw new Error("Invalid animal ID format.");
  }
  try {
    const animal = await prisma.animal.findUniqueOrThrow({
      where: { id: id.data },
      select: { id: true, speciesId: true, listingStatus: true, sex: true },
    });
    const [{ items, scheduledItems }, vetClinics, today, spayNeuter, settings] =
      await Promise.all([
        findMedicalEntryFormItems(prisma, animal),
        findActiveVetClinics(prisma),
        getShelterToday(),
        findSpayNeuterEntries(prisma, [animal.id]),
        getShelterSettings(),
      ]);
    return {
      items,
      scheduledItems,
      inCare: animal.listingStatus !== AnimalListingStatus.ARCHIVED,
      sex: animal.sex,
      altered:
        spayNeuterStatus(spayNeuter.get(animal.id) ?? [], today).status ===
        "ALTERED",
      vetClinics,
      today,
      weightUnitSystem: settings.weightUnitSystem,
    };
  } catch (error) {
    console.error("Failed to fetch medical entry form options:", error);
    throw new Error("Could not fetch the medical entry form options.");
  }
};

export const fetchMedicalEntryFormOptions = RequirePermission(
  AppPermissions.MEDICAL_ADMINISTER,
)(_fetchMedicalEntryFormOptions);

/**
 * What a Medical page offers the viewer beyond reading: the entry forms'
 * options, and which of the two medical write permissions they hold.
 * `canAdminister` gives scheduled care (records or declines it) and records
 * medication doses; `canManage` plans and corrects care (schedules,
 * reschedules, records ad hoc, edits, voids), keeps the problem list and care
 * episodes, and orders medications.
 */
export interface MedicalControls {
  animalId: string;
  options: MedicalEntryFormOptions;
  /** What the problem-list and care-episode forms offer; null without
   * `canManage`. */
  conditionChoices: ConditionFormChoices | null;
  /** What the medication order form offers; null without `canManage`. */
  orderOptions: MedicationOrderFormOptions | null;
  canManage: boolean;
  canAdminister: boolean;
  /** Whether they may also change the animal's traits, as adding one from a
   * condition does. */
  canManageCharacteristics: boolean;
}

/**
 * The viewer's controls on one animal's Medical pages, or null when they may
 * only read. Every role holding MEDICAL_MANAGE also holds MEDICAL_ADMINISTER,
 * so null means neither.
 */
export const fetchMedicalControls = async (
  animalId: string,
): Promise<MedicalControls | null> => {
  const [canManage, canAdminister, canManageCharacteristics] = await Promise.all([
    hasPermission(AppPermissions.MEDICAL_MANAGE),
    hasPermission(AppPermissions.MEDICAL_ADMINISTER),
    hasPermission(AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE),
  ]);
  if (!canAdminister) return null;
  const [options, conditionChoices, orderOptions] = await Promise.all([
    fetchMedicalEntryFormOptions(animalId),
    canManage ? fetchConditionFormChoices(animalId) : null,
    canManage ? fetchMedicationOrderFormOptions(animalId) : null,
  ]);
  return {
    animalId,
    options,
    conditionChoices,
    orderOptions,
    canManage,
    canAdminister,
    canManageCharacteristics,
  };
};
