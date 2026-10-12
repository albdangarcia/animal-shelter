import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getShelterToday } from "./shelter-settings.data";
import type { CalendarDay } from "../utils/shelter-day";
import {
  findActiveVetClinics,
  findMedicalBatchItem,
  findMedicalBatchItems,
  type MedicalBatchItem,
} from "./medical-catalog";
import {
  findMedicalBatchAnimals,
  groupBatchAnimals,
  type MedicalBatchAnimalGroup,
} from "./medical-batch";

export type { MedicalBatchItem } from "./medical-catalog";
export type {
  MedicalBatchAnimal,
  MedicalBatchAnimalGroup,
  MedicalBatchAnimalSet,
} from "./medical-batch";

export interface MedicalBatchOptions {
  /** The animals in care, grouped by where they are. */
  groups: MedicalBatchAnimalGroup[];
  /** The species of those animals, for the checklist's filter. */
  species: { id: string; name: string }[];
  /** The vaccines and treatments a batch can give or schedule. */
  items: MedicalBatchItem[];
  vetClinics: { id: string; name: string }[];
  today: CalendarDay;
}

const _fetchMedicalBatchOptions = async (): Promise<MedicalBatchOptions> => {
  try {
    const [animals, items, vetClinics, today] = await Promise.all([
      findMedicalBatchAnimals(prisma),
      findMedicalBatchItems(prisma),
      findActiveVetClinics(prisma),
      getShelterToday(),
    ]);
    const species = [
      ...new Map(animals.map((animal) => [animal.species.id, animal.species])).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    return { groups: groupBatchAnimals(animals), species, items, vetClinics, today };
  } catch (error) {
    console.error("Failed to fetch the medical batch options:", error);
    throw new Error("Could not fetch the batch entry form.");
  }
};

/** What batch entry picks from: planning and recording care, as for one
 * animal. */
export const fetchMedicalBatchOptions = RequirePermission(
  AppPermissions.MEDICAL_MANAGE,
)(_fetchMedicalBatchOptions);

export interface ScheduledBatchFormOptions {
  /** The item the entries share, retired or not: the care is already
   * scheduled. */
  item: MedicalBatchItem;
  vetClinics: { id: string; name: string }[];
  today: CalendarDay;
}

const _fetchScheduledBatchFormOptions = async (
  itemId: string,
): Promise<ScheduledBatchFormOptions | null> => {
  try {
    const [item, vetClinics, today] = await Promise.all([
      findMedicalBatchItem(prisma, itemId),
      findActiveVetClinics(prisma),
      getShelterToday(),
    ]);
    return item && { item, vetClinics, today };
  } catch (error) {
    console.error("Failed to fetch the scheduled batch form options:", error);
    throw new Error("Could not fetch the form.");
  }
};

/** What the form recording several scheduled entries for one item offers:
 * behind the same permission as giving scheduled care. */
export const fetchScheduledBatchFormOptions = RequirePermission(
  AppPermissions.MEDICAL_ADMINISTER,
)(_fetchScheduledBatchFormOptions);
