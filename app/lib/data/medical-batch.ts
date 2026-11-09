// What batch entry picks from: the animals in the shelter's care, and where
// each is. No auth or `next/*` imports, so database tests can call it;
// `medical-batch.data.ts` wraps it behind MEDICAL_MANAGE.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { ANIMAL_PLACE_SELECT, placeOf } from "./medical-due";
import type { MedicalBatchAnimal } from "./medical-batch-groups";

export {
  animalsOfGroup,
  groupBatchAnimals,
  type MedicalBatchAnimal,
  type MedicalBatchAnimalGroup,
  type MedicalBatchAnimalSet,
} from "./medical-batch-groups";

type Db = TransactionClient | typeof prisma;

/** Every animal in care (listing status not ARCHIVED), with where it is. */
export const findMedicalBatchAnimals = async (
  db: Db,
): Promise<MedicalBatchAnimal[]> => {
  const animals = await db.animal.findMany({
    where: { listingStatus: { not: AnimalListingStatus.ARCHIVED } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      species: { select: { id: true, name: true } },
      sex: true,
      primaryColor: { select: { name: true } },
      birthDate: true,
      ...ANIMAL_PLACE_SELECT,
    },
  });
  return animals.map((animal) => ({
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    primaryColor: animal.primaryColor.name,
    birthDate: animal.birthDate,
    place: placeOf(animal),
  }));
};
