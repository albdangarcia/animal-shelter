import { MicrochipRegistrationStatus } from "@/prisma/generated/enums";
import { normaliseChipNumber } from "./microchip";
import { beforeBirthIssue, futureDayIssue } from "./medical-days";
import type { CalendarDay } from "./shelter-day";

export const MICROCHIP_REGISTRATION_LABELS: Record<MicrochipRegistrationStatus, string> = {
  UNKNOWN: "Unknown",
  NOT_REGISTERED: "Not registered",
  PENDING: "Pending",
  REGISTERED: "Registered",
};

export interface MicrochipRegistration {
  registrationStatus: MicrochipRegistrationStatus;
  registryName: string | null;
  registrationDate: CalendarDay | null;
  registrationNotes: string | null;
}

export interface RegistrationIssue {
  field: keyof MicrochipRegistration;
  message: string;
}

const text = (value: string | null | undefined) => value?.trim() || null;

/** Omitted historical facts mean unknown; no day or registry is inferred. */
export const normaliseMicrochipRegistration = (
  input: Partial<MicrochipRegistration>,
): MicrochipRegistration => ({
  registrationStatus: input.registrationStatus ?? MicrochipRegistrationStatus.UNKNOWN,
  registryName: text(input.registryName),
  registrationDate: input.registrationDate ?? null,
  registrationNotes: text(input.registrationNotes),
});

/** Group consistency, independent of an animal or clock. */
export const microchipRegistrationIssue = (
  input: MicrochipRegistration,
): RegistrationIssue | null => {
  if (input.registrationStatus === MicrochipRegistrationStatus.REGISTERED) {
    return text(input.registryName) ? null : {
      field: "registryName", message: "A registered chip needs its registry name.",
    };
  }
  if (input.registrationDate) {
    return { field: "registrationDate", message: "Only a registered chip has a registration date." };
  }
  if (input.registrationStatus !== MicrochipRegistrationStatus.PENDING && text(input.registryName)) {
    return { field: "registryName", message: "A registry name is only for pending or registered chips." };
  }
  return null;
};

/** Registration may predate intake, but never birth, implantation or today. */
export const microchipRegistrationDayIssue = (
  registrationDate: CalendarDay | null,
  context: { today: CalendarDay; birthDate: CalendarDay | null; implantationDate: CalendarDay | null },
): RegistrationIssue | null => {
  if (!registrationDate) return null;
  const message = futureDayIssue(registrationDate, context.today, "The registration date")
    ?? (context.birthDate ? beforeBirthIssue(registrationDate, context.birthDate, "The registration date") : null)
    ?? (context.implantationDate && registrationDate < context.implantationDate
      ? "The registration date can't be before the chip's implantation date."
      : null);
  return message ? { field: "registrationDate", message } : null;
};

const REGISTRATION_FIELDS = [
  "registrationStatus", "registryName", "registrationDate", "registrationNotes",
] as const;

/** Check the submitted group before omitted values are filled from storage. */
export const microchipRegistrationReplacementIssue = (
  stored: { chipNumber: string } & MicrochipRegistration,
  submitted: { chipNumber: string } & Partial<MicrochipRegistration>,
): RegistrationIssue | null => {
  if (normaliseChipNumber(stored.chipNumber) === normaliseChipNumber(submitted.chipNumber)) return null;
  const hasRegistration = stored.registrationStatus !== MicrochipRegistrationStatus.UNKNOWN
    || !!text(stored.registryName) || !!stored.registrationDate || !!text(stored.registrationNotes);
  if (!hasRegistration || REGISTRATION_FIELDS.every((field) =>
    Object.hasOwn(submitted, field) && submitted[field] !== undefined)) return null;
  return {
    field: "registrationStatus",
    message: "Enter the registration details for this chip number, including Unknown when they aren't known.",
  };
};
