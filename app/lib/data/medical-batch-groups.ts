// How batch entry lists the animals it can pick from: a pure function of the
// rows, with no Prisma import, so unit tests and the page can use it. The rows
// are read in `medical-batch.ts`.

import type { Sex } from "@/prisma/generated/enums";
import type { MedicalDuePlace } from "./medical-due-groups";

/** An animal in care, as the batch checklist shows it. */
export interface MedicalBatchAnimal {
  id: string;
  name: string;
  species: { id: string; name: string };
  /** What tells it from another animal of the same name. */
  sex: Sex;
  primaryColor: string;
  birthDate: string;
  place: MedicalDuePlace;
}

/** A unit inside a location, or a foster home, or "Not housed". */
export interface MedicalBatchAnimalSet {
  /** Unique across the whole checklist. */
  key: string;
  title: string;
  animals: MedicalBatchAnimal[];
}

/**
 * The checklist, grouped as the due list is: a group per location (by name)
 * holding a set per unit (by name), then one per foster (by name), then "Not
 * housed". "Select all" works on a group or on a set, which covers a room or
 * a litter without a litter model.
 */
export type MedicalBatchAnimalGroup =
  | { key: string; type: "LOCATION"; title: string; units: MedicalBatchAnimalSet[] }
  | ({ type: "FOSTER" | "NOT_HOUSED" } & MedicalBatchAnimalSet);

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

const byTitle = (a: { title: string; key: string }, b: { title: string; key: string }) =>
  a.title.localeCompare(b.title) || a.key.localeCompare(b.key);

/** Every animal a group holds, in the order the checklist shows them. */
export const animalsOfGroup = (group: MedicalBatchAnimalGroup) =>
  group.type === "LOCATION"
    ? group.units.flatMap((unit) => unit.animals)
    : group.animals;

export const groupBatchAnimals = (
  animals: MedicalBatchAnimal[],
): MedicalBatchAnimalGroup[] => {
  const locations = new Map<
    string,
    { title: string; units: Map<string, MedicalBatchAnimalSet> }
  >();
  const fosters = new Map<string, MedicalBatchAnimalSet>();
  const notHoused: MedicalBatchAnimal[] = [];

  for (const animal of animals) {
    const { place } = animal;
    if (place.type === "UNIT") {
      let location = locations.get(place.locationId);
      if (!location) {
        location = { title: place.locationName, units: new Map() };
        locations.set(place.locationId, location);
      }
      let unit = location.units.get(place.unitId);
      if (!unit) {
        unit = { key: `unit:${place.unitId}`, title: place.unitName, animals: [] };
        location.units.set(place.unitId, unit);
      }
      unit.animals.push(animal);
    } else if (place.type === "FOSTER") {
      let foster = fosters.get(place.fosterPersonId);
      if (!foster) {
        foster = {
          key: `foster:${place.fosterPersonId}`,
          title: place.fosterName,
          animals: [],
        };
        fosters.set(place.fosterPersonId, foster);
      }
      foster.animals.push(animal);
    } else {
      notHoused.push(animal);
    }
  }

  const sortSet = (set: MedicalBatchAnimalSet) => ({
    ...set,
    animals: [...set.animals].sort(byName),
  });

  return [
    ...[...locations.entries()]
      .map(([locationId, location]) => ({
        key: `location:${locationId}`,
        type: "LOCATION" as const,
        title: location.title,
        units: [...location.units.values()].map(sortSet).sort(byTitle),
      }))
      .sort(byTitle),
    ...[...fosters.values()]
      .map((foster) => ({ ...sortSet(foster), type: "FOSTER" as const }))
      .sort(byTitle),
    ...(notHoused.length > 0
      ? [
          {
            key: "not-housed",
            type: "NOT_HOUSED" as const,
            title: "Not housed",
            animals: [...notHoused].sort(byName),
          },
        ]
      : []),
  ];
};
