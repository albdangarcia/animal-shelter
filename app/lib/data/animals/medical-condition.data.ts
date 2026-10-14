import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { getShelterToday } from "../shelter-settings.data";
import type { CalendarDay } from "../../utils/shelter-day";
import {
  findCareEpisodes,
  findConditionEventNames,
  findConditionFormChoices,
  findProblemList,
  type CareEpisodeDisplay,
  type ConditionFormChoices,
  type MedicalConditionDisplay,
} from "./medical-condition";

export type {
  CareEpisodeDisplay,
  ConditionFormChoices,
  MedicalConditionDisplay,
} from "./medical-condition";

const parseAnimalId = (animalId: string) => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) {
    throw new Error("Invalid animal ID format.");
  }
  return parsed.data;
};

export interface ConditionsPage {
  animalName: string;
  conditions: MedicalConditionDisplay[];
  episodes: CareEpisodeDisplay[];
  /** Names for the ids the rows' change histories mention, keyed by id. */
  names: Record<string, string>;
  today: CalendarDay;
}

const _fetchConditionsPage = async (animalId: string): Promise<ConditionsPage> => {
  const id = parseAnimalId(animalId);
  try {
    const [animal, conditions, episodes, today] = await Promise.all([
      prisma.animal.findUniqueOrThrow({ where: { id }, select: { name: true } }),
      findProblemList(prisma, id),
      findCareEpisodes(prisma, id),
      getShelterToday(),
    ]);
    return {
      animalName: animal.name,
      conditions,
      episodes,
      names: await findConditionEventNames(prisma, conditions, episodes),
      today,
    };
  } catch (error) {
    console.error("Failed to fetch the problem list and care episodes:", error);
    throw new Error("Could not fetch the problem list and care episodes.");
  }
};

export const fetchConditionsPage = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchConditionsPage);

const _fetchConditionFormChoices = async (
  animalId: string,
): Promise<ConditionFormChoices> => {
  const id = parseAnimalId(animalId);
  try {
    return await findConditionFormChoices(prisma, id);
  } catch (error) {
    console.error("Failed to fetch the condition form's choices:", error);
    throw new Error("Could not fetch the condition form's choices.");
  }
};

// Only those who change the problem list and care episodes need what their
// forms offer.
export const fetchConditionFormChoices = RequirePermission(
  AppPermissions.MEDICAL_MANAGE,
)(_fetchConditionFormChoices);
