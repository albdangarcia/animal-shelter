import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import type { AnimalReadiness } from "../../readiness/board";
import type { ReadinessBlocker } from "../../readiness/compute-readiness";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequireAllPermissions } from "../../auth/protected-actions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import {
  findAnimalReadiness,
  findReadinessForAnimals,
  type ShelterDay,
} from "./readiness";

// The shelter's today is read once per request, so the board judges every
// animal on the same day, and the panel agrees with the card beside it.
const shelterDay = async (): Promise<ShelterDay> => {
  const [settings, today] = await Promise.all([
    getShelterSettings(),
    getShelterToday(),
  ]);
  return { timezone: settings.timezone, today };
};

/** One animal's identity and blockers; null when no animal has that id. */
const readinessOfAnimal = async (
  animalId: string,
): Promise<AnimalReadiness | null> =>
  findAnimalReadiness(prisma, animalId, await shelterDay());

const _fetchAnimalReadiness = async (
  animalId: string,
): Promise<ReadinessBlocker[]> => {
  const readiness = await readinessOfAnimal(animalId);
  if (!readiness) {
    throw new Error("Animal not found.");
  }
  return readiness.blockers;
};

export const fetchAnimalReadiness = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.MEDICAL_READ,
)(_fetchAnimalReadiness);

// Exported unwrapped for the AI tool layer: a tool's `execute` runs
// mid-stream where `RequirePermission`'s ambient session read is unreliable.
// `getAnimalReadiness` (and `getAnimalSummary`, for its readiness line) calls
// `requireFor` / `can` for all four reads itself before calling this.
// Carries the animal's identity alongside its blockers, so the tool can tell
// an archived animal from a blocked one. Returns `null` for an unknown or
// malformed id — the tool turns that into a structured failure.
export const _fetchAnimalReadinessForAssistant = async (
  animalId: string,
): Promise<AnimalReadiness | null> => {
  const parsedId = cuidSchema.safeParse(animalId);
  if (!parsedId.success) return null;
  return readinessOfAnimal(parsedId.data);
};

/**
 * Every non-archived animal's blockers, for the readiness board — including
 * animals with none, so the board can say how many are ready. Archived
 * animals (adopted, transferred, deceased) are frozen history — nothing
 * about them can still be "blocked" from adoption.
 */
const _fetchReadinessForAnimals = async (): Promise<AnimalReadiness[]> =>
  findReadinessForAnimals(prisma, await shelterDay());

export const fetchReadinessForAnimals = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.MEDICAL_READ,
)(_fetchReadinessForAnimals);
