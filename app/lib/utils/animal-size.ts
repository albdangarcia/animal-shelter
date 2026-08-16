import { AnimalSize } from "@/prisma/generated/enums";

/**
 * Calculates the animal's size category based on its species and weight.
 * @param speciesName The name of the species (e.g., "Dog", "Cat").
 * @param weightKg The animal's weight in kilograms.
 * @returns The calculated AnimalSize enum or null if unable to determine.
 */
export const getAnimalSize = (
  speciesName: string,
  weightKg: number | undefined | null
): AnimalSize | null => {
  if (!weightKg || weightKg <= 0) {
    return null;
  }

  const species = speciesName.toLowerCase();

  if (species === "dog") {
    if (weightKg < 10) return AnimalSize.SMALL;
    if (weightKg < 25) return AnimalSize.MEDIUM;
    if (weightKg < 45) return AnimalSize.LARGE;
    return AnimalSize.XLARGE;
  }

  if (species === "cat") {
    if (weightKg < 4) return AnimalSize.SMALL;
    if (weightKg < 7) return AnimalSize.MEDIUM;
    return AnimalSize.LARGE;
  }

  // A generic fallback for other species
  if (weightKg < 5) return AnimalSize.SMALL;
  if (weightKg < 20) return AnimalSize.MEDIUM;
  return AnimalSize.LARGE;
};
