import {
  IntakeType,
  Sex,
  AnimalHealthStatus,
  AnimalListingStatus,
  AnimalSize,
  TaskCategory,
  TaskStatus,
  TaskPriority,
  NoteCategory,
  ApplicationStatus,
  LivingSituation,
  OutcomeType,
  LocationType,
  FosterPlacementType,
  FosterReturnReason
} from "@/prisma/generated/enums";

/**
 * Formats a Prisma enum's string values for display.
 * E.g., "OWNER_SURRENDER" becomes "Owner Surrender".
 * @param enumObject The Prisma enum object (e.g., IntakeType).
 * @returns An array of formatted display strings.
 */
function formatEnumForDisplay<T extends string>(enumObject: {
  [key: string]: T;
}): string[] {
  return Object.values(enumObject).map((value: T) => {
    return value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  });
}

/**
 * Formats a Prisma enum into an array of objects suitable for <select> options.
 * Each object has a 'value' (the raw enum key) and a 'label' (the formatted display string).
 * E.g., { value: "OWNER_SURRENDER", label: "Owner Surrender" }
 * @param enumObject The Prisma enum object (e.g., IntakeType).
 * @returns An array of option objects.
 */
function formatEnumAsOptions<T extends string>(enumObject: {
  [key: string]: T;
}): { value: T; label: string }[] {
  return Object.entries(enumObject).map(([_key, value]) => ({
    value: value, // Use the raw enum value as the value for consistency with how Prisma stores it
    label: value // Use the raw enum value for formatting
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" "),
  }));
}

/**
 * Formats a single Prisma enum string value for display.
 * This is similar to `formatEnumForDisplay` but for a single value instead of a list.
 * E.g., "OWNER_SURRENDER" becomes "Owner Surrender".
 * @param type The single enum string value.
 * @returns The formatted display string, or "N/A" if the input is falsy.
 * @example
 * formatSingleEnumOption("FOSTER_CARE") // Returns "Foster Care"
 */
export const formatSingleEnumOption = (type: string | null | undefined) => {
  if (!type) return "N/A";
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const ANIMAL_SIZE_LABELS: Record<AnimalSize, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  XLARGE: "Extra Large",
};

/** Display label for an animal size. Returns null for null/undefined so callers
 *  that hide empty values keep working — do NOT use formatSingleEnumOption here,
 *  it renders XLARGE as "Xlarge" and null as "N/A". */
export const formatAnimalSize = (
  size: AnimalSize | null | undefined,
): string | null => (size ? ANIMAL_SIZE_LABELS[size] : null);

export const formattedIntakeTypes = formatEnumForDisplay(IntakeType);
export const formattedSexes = formatEnumForDisplay(Sex);
export const formattedPetHealthStatuses =
  formatEnumForDisplay(AnimalHealthStatus);

export const intakeTypeOptions = formatEnumAsOptions(IntakeType);
export const animalSexOptions = formatEnumAsOptions(Sex);
export const animalSizeOptions = Object.entries(ANIMAL_SIZE_LABELS).map(
  ([value, label]) => ({ value: value as AnimalSize, label }),
);
export const animalHealthStatusOptions =
  formatEnumAsOptions(AnimalHealthStatus);
export const animalListingStatusOptions =
  formatEnumAsOptions(AnimalListingStatus);

export const TaskCategoryOptions = formatEnumAsOptions(TaskCategory);
export const TaskStatusOptions = formatEnumAsOptions(TaskStatus);
export const TaskPriorityOptions = formatEnumAsOptions(TaskPriority);

export const noteCategoryOptions = formatEnumAsOptions(NoteCategory);

export const livingSituationOptions = formatEnumAsOptions(LivingSituation);
export const myApplicationStatusOptions = formatEnumAsOptions(ApplicationStatus);

export const userApplicationStatusOptions = formatEnumAsOptions(ApplicationStatus);

export const outcomeTypeOptions = formatEnumAsOptions(OutcomeType)

export const locationTypeOptions = formatEnumAsOptions(LocationType);

export const fosterPlacementTypeOptions = formatEnumAsOptions(FosterPlacementType);
export const fosterReturnReasonOptions = formatEnumAsOptions(FosterReturnReason);