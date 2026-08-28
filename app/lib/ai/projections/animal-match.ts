import type { AiAnimalMatchRow } from "@/app/lib/data/animals/animal.data";

/**
 * One row of `findAnimals`' disambiguation set. Hand-written, not
 * `Prisma.AnimalGetPayload`: a widened `select` upstream must never
 * silently reach the model.
 *
 * Enough for a person to tell two same-named animals apart — id (to chain into
 * `getAnimalSummary`), name, species, birth date, current unit. `birthDate` is
 * an ISO date string; the model reasons badly about raw serialized dates
 * without a stated reference point (the system prompt states today's date).
 */
export type AnimalMatch = {
  animalId: string;
  name: string;
  species: string;
  birthDate: string;
  currentUnit: string | null;
};

// "Dog block A · A-3", matching the "Location · Unit" convention used across
// the app (see app/lib/utils/location-activity.ts). Null for fostered /
// unplaced animals.
function formatUnit(
  unit: { name: string; location: { name: string } } | null,
): string | null {
  return unit ? `${unit.location.name} · ${unit.name}` : null;
}

export function toAnimalMatch(row: AiAnimalMatchRow): AnimalMatch {
  return {
    animalId: row.id,
    name: row.name,
    species: row.species.name,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    currentUnit: formatUnit(row.currentUnit),
  };
}
