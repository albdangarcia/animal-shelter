// The batch forms' rules that need only what the page already has. The
// batch service enforces each of them regardless; these let the forms say so
// before anything is sent.

import { MedicalEntryKind, type Sex } from "@/prisma/generated/enums";
import { MAX_BATCH_SIZE } from "@/app/lib/constants/medical";
import {
  parseCalendarDay,
  shelterDaysBetweenKeys,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

// "a", "a and b", "a, b and c".
const joinNames = (names: string[]) =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Why the animals picked can't make a batch yet, or null when they can. */
export const batchSizeIssue = (count: number): string | null =>
  count === 0
    ? "Pick at least one animal."
    : count > MAX_BATCH_SIZE
      ? `A batch can cover at most ${MAX_BATCH_SIZE} animals. ${count} are picked.`
      : null;

/**
 * The animals picked that the item isn't for. An item with no species is for
 * every species.
 */
export const animalsItemIsNotFor = <T extends { species: { id: string } }>(
  item: { speciesIds: string[] } | undefined,
  animals: T[],
): T[] =>
  item && item.speciesIds.length > 0
    ? animals.filter((animal) => !item.speciesIds.includes(animal.species.id))
    : [];

/**
 * Why the due care picked can't be recorded as given together, or null when
 * it can: it must be for one item, so the same lot and dose fit it all.
 */
export const scheduledBatchIssue = (
  selected: { itemId: string; itemName: string; kind: MedicalEntryKind }[],
): string | null => {
  if (selected.length === 0) {
    return "Select due vaccines or treatments to record several as given at once.";
  }
  const names = [...new Set(selected.map((entry) => entry.itemName))].sort();
  if (new Set(selected.map((entry) => entry.itemId)).size > 1) {
    return `The selected entries are for different items (${joinNames(names)}). Select entries for one item.`;
  }
  if (selected[0].kind === MedicalEntryKind.TEST) {
    return "Tests are recorded one at a time, since each animal has its own results.";
  }
  if (selected.length > MAX_BATCH_SIZE) {
    return `At most ${MAX_BATCH_SIZE} entries can be recorded at once. ${selected.length} are selected.`;
  }
  return null;
};

/** What tells one animal from another of the same name. */
export interface IdentifiableAnimal {
  id: string;
  name: string;
  species: string;
  sex: Sex;
  primaryColor: string;
  birthDate: string;
}

const SEX_TEXT: Record<Sex, string> = {
  MALE: "male",
  FEMALE: "female",
  UNKNOWN: "sex unknown",
};

const counted = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * An age in its largest whole unit ("2 years", "5 months", "3 weeks"), on
 * `today`, the shelter's day. Counted in calendar days rather than from the
 * clock, so the server and the browser, whatever their time zones, say the
 * same thing. Null for a birth date that isn't a day, or is after today: no
 * age can be given for it.
 */
export const ageOn = (birthDate: string, today: CalendarDay): string | null => {
  const born = parseCalendarDay(birthDate);
  if (!born || born > today) return null;
  const [by, bm, bd] = born.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months >= 12) return counted(Math.floor(months / 12), "year");
  if (months >= 1) return counted(months, "month");
  const days = shelterDaysBetweenKeys(born, today);
  if (days >= 7) return counted(Math.floor(days / 7), "week");
  return days === 0 ? "newborn" : counted(days, "day");
};

/**
 * What tells each animal from another in `animals` with the same name, by
 * id: its species, sex, primary colour and age ("Dog · male, orange, 1
 * year"; the age is left out when there is none to give), or null when no
 * other animal there has its name. Animals have no
 * tag number of their own, and a batch writes to every animal picked, so
 * staff must be able to tell which one each line is.
 */
export const sameNameDetails = (
  animals: IdentifiableAnimal[],
  today: CalendarDay,
): Map<string, string | null> => {
  const key = (name: string) => name.trim().toLocaleLowerCase();
  const idsByName = new Map<string, Set<string>>();
  for (const animal of animals) {
    idsByName.set(
      key(animal.name),
      (idsByName.get(key(animal.name)) ?? new Set()).add(animal.id),
    );
  }
  return new Map(
    animals.map((animal) => [
      animal.id,
      (idsByName.get(key(animal.name))?.size ?? 0) > 1
        ? `${animal.species} · ${[
            SEX_TEXT[animal.sex],
            animal.primaryColor.toLocaleLowerCase(),
            ageOn(animal.birthDate, today),
          ]
            .filter(Boolean)
            .join(", ")}`
        : null,
    ]),
  );
};

/**
 * How the batch checklist names each animal, by id: "Misty (Cat)", or, when
 * another animal in `animals` shares the name, "Rex (Dog · male, orange, 1
 * year)".
 */
export const batchAnimalLabels = (
  animals: IdentifiableAnimal[],
  today: CalendarDay,
): Map<string, string> => {
  const details = sameNameDetails(animals, today);
  return new Map(
    animals.map((animal) => [
      animal.id,
      `${animal.name} (${details.get(animal.id) ?? animal.species})`,
    ]),
  );
};
