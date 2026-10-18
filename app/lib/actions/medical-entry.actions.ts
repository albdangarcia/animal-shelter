"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { can } from "../auth/can";
import { MedicalEntryKind, SurgeryProcedure } from "@/prisma/generated/enums";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  DeclineMedicalEntrySchema,
  MedicalBatchSchema,
  MedicalEntryFormSchema,
  RecordScheduledBatchSchema,
  RecordSpayNeuterExemptionSchema,
  RescheduleMedicalEntrySchema,
  ScheduleMedicalEntrySchema,
  VoidMedicalEntrySchema,
  medicalEntryFieldErrors,
  type DeclineMedicalEntryInput,
  type MedicalBatchFormInput,
  type MedicalEntryFormInput,
  type MedicalEntryFormValues,
  type RecordScheduledBatchFormInput,
  type RecordSpayNeuterExemptionFormInput,
  type RescheduleMedicalEntryInput,
  type ScheduleMedicalEntryFormInput,
  type VoidMedicalEntryInput,
} from "../zod-schemas/medical-entry.schemas";
import {
  MedicalEntryRefusal,
  nameChipNumberHolder,
  declineMedicalEntry as declineEntry,
  editMedicalEntry as editEntry,
  recordMedicalEntry as recordEntry,
  recordScheduledMedicalEntry as recordScheduledEntry,
  recordSpayNeuterExemption as recordExemption,
  rescheduleMedicalEntry as rescheduleEntry,
  scheduleMedicalEntry as scheduleEntry,
  voidMedicalEntry as voidEntry,
  type RecordMedicalEntryInput,
  type RecordScheduledEntryOptions,
} from "../services/medical-entry";
import {
  MedicalBatchRefusal,
  recordMedicalBatch as recordBatch,
  recordScheduledMedicalBatch as recordScheduledBatch,
  type MedicalBatchAnimalRefusal,
  type MedicalBatchInput,
  type MedicalBatchResult,
} from "../services/medical-batch";
import { NO_OP_EDIT_MESSAGE } from "../services/note-audit";
import {
  getShelterSettings,
  getShelterToday,
  getShelterNow,
} from "../data/shelter-settings.data";
import { examVitalsInstant } from "../utils/exam-vitals";
import type { CalendarDay } from "../utils/shelter-day";
import {
  fetchMedicalEntryFormOptions,
  type MedicalEntryFormOptions,
} from "../data/medical-catalog.data";
import {
  fetchScheduledBatchFormOptions,
  type ScheduledBatchFormOptions,
} from "../data/medical-batch.data";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type {
  ActionFailure,
  ActionSuccess,
  FieldErrors,
  FormResult,
} from "@/app/lib/action-result";

type EntryResult = FormResult<MedicalEntryFormInput>;

// The Medical pages, the animal's page for its activity feed and its card, the
// Vitals page for the vitals an exam measured, the shelter-wide due list, and
// the public pet pages, whose "Neutered" and "Microchipped" pills are read
// from the record. The home page and the readiness board render per request
// (both read the session, and the board its search params), so neither has a
// cached copy to refresh.
const revalidateMedical = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(`/medical-outputs/animals/${animalId}/history`);
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/history`);
  revalidatePath(`${animalPath}/medical/vaccines-tests`);
  // A condition names the test or exam it was found on, and a document the
  // entry it belongs to, and both say so once that entry is voided.
  revalidatePath(`${animalPath}/medical/conditions`);
  revalidatePath(`${animalPath}/medical/documents`);
  revalidatePath(`${animalPath}/medical/vitals`);
  revalidatePath("/dashboard/medical/due");
  revalidatePath("/pets");
  revalidatePath("/pets/favorites");
  revalidatePath(`/pets/${animalId}`);
};

/** A refusal from the service, keyed to its field when it has one. */
const refused = <TValues>(error: unknown): FormResult<TValues> | null => {
  if (error instanceof MedicalEntryRefusal && error.field) {
    return {
      ok: false,
      message: error.message,
      fieldErrors: { [error.field]: [error.message] } as FieldErrors<TValues>,
    };
  }
  if (
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof PreconditionFailedError
  ) {
    return { ok: false, message: error.message };
  }
  return null;
};

const invalidFields = (
  error: z.ZodError<MedicalEntryFormInput>,
): EntryResult => ({
  ok: false,
  message: "Missing or invalid fields. The entry was not saved.",
  fieldErrors: medicalEntryFieldErrors(
    error,
  ) as FieldErrors<MedicalEntryFormInput>,
});

/**
 * The parsed form as the service records it. Vitals an exam measured were
 * taken on its day: now when that is today, or as the day began. Sending
 * them needs the permission to record vitals too. A spay or neuter the exam
 * found is new care, not care that was planned, so it needs the permission
 * to record care on its own, even when the exam itself was scheduled.
 */
const toRecordInput = async (
  user: SessionUser,
  data: MedicalEntryFormValues,
  today: CalendarDay,
  now: Date,
): Promise<
  | { ok: true; input: RecordMedicalEntryInput; options: RecordScheduledEntryOptions }
  | { ok: false; result: EntryResult }
> => {
  const settings = await getShelterSettings();
  const options = { weightUnitSystem: settings.weightUnitSystem };
  if (
    data.kind === MedicalEntryKind.EXAM &&
    data.foundAltered &&
    !can(user.role, AppPermissions.MEDICAL_MANAGE)
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "You don't have permission to record a spay or neuter.",
      },
    };
  }
  if (data.kind !== MedicalEntryKind.EXAM || !data.vitals) {
    return { ok: true, input: { ...data, vitals: null }, options };
  }
  if (!can(user.role, AppPermissions.ANIMAL_VITALS_MANAGE)) {
    return {
      ok: false,
      result: { ok: false, message: "You don't have permission to record vitals." },
    };
  }
  // An exam's day is always known: the schema refuses one before intake. If
  // it were missing, the service refuses the day before writing anything.
  const recordedAt = examVitalsInstant(
    data.completedDate ?? today,
    today,
    settings.timezone,
    now,
  );
  return {
    ok: true,
    input: { ...data, vitals: { ...data.vitals, recordedAt } },
    options,
  };
};

const _recordMedicalEntry = async (
  user: SessionUser,
  animalId: string,
  values: MedicalEntryFormInput,
  vetReportId?: string,
): Promise<EntryResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  if (vetReportId !== undefined && (!cuidSchema.safeParse(vetReportId).success || !can(user.role, AppPermissions.MEDICAL_MANAGE))) {
    return { ok: false, message: "Invalid report or permission to record care from it." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const { today, now } = await getShelterNow();
  const recording = await toRecordInput(user, validated.data, today, now);
  if (!recording.ok) return recording.result;
  try {
    await prisma.$transaction((tx) =>
      recordEntry(
        tx,
        { ...recording.input, animalId: parsedAnimalId.data },
        user.personId,
        today,
        { ...recording.options, vetReportId },
      ),
    );
  } catch (error) {
    // A chip number another animal took at the same moment reads as the
    // service's refusal, naming that animal when it still holds it.
    const refusal = refused<MedicalEntryFormInput>(
      await nameChipNumberHolder(prisma, error),
    );
    if (refusal) return refusal;
    console.error("Database error recording medical entry:", error);
    return { ok: false, message: "Database Error: Failed to record entry." };
  }

  revalidateMedical(parsedAnimalId.data);
  if (vetReportId) {
    revalidatePath("/dashboard/medical/due");
    revalidatePath(`/dashboard/my-foster-animals/${parsedAnimalId.data}`);
  }
  return { ok: true, message: "Entry recorded." };
};

const _recordScheduledMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: MedicalEntryFormInput,
  vetReportId?: string,
): Promise<EntryResult> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  if (vetReportId !== undefined && (!cuidSchema.safeParse(vetReportId).success || !can(user.role, AppPermissions.MEDICAL_MANAGE))) {
    return { ok: false, message: "Invalid report or permission to record care from it." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const { today, now } = await getShelterNow();
  const recording = await toRecordInput(user, validated.data, today, now);
  if (!recording.ok) return recording.result;
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      recordScheduledEntry(
        tx,
        parsedId.data,
        recording.input,
        user.personId,
        today,
        { ...recording.options, vetReportId },
      ),
    ));
  } catch (error) {
    // A chip number another animal took at the same moment reads as the
    // service's refusal, naming that animal when it still holds it.
    const refusal = refused<MedicalEntryFormInput>(
      await nameChipNumberHolder(prisma, error),
    );
    if (refusal) return refusal;
    console.error("Database error recording scheduled medical entry:", error);
    return { ok: false, message: "Database Error: Failed to record entry." };
  }

  revalidateMedical(animalId);
  if (vetReportId) {
    revalidatePath("/dashboard/medical/due");
    revalidatePath(`/dashboard/my-foster-animals/${animalId}`);
  }
  return { ok: true, message: "Entry recorded." };
};

const _scheduleMedicalEntry = async (
  user: SessionUser,
  animalId: string,
  values: ScheduleMedicalEntryFormInput,
): Promise<FormResult<ScheduleMedicalEntryFormInput>> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = ScheduleMedicalEntrySchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Nothing was scheduled.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<ScheduleMedicalEntryFormInput>,
    };
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      scheduleEntry(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<ScheduleMedicalEntryFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error scheduling medical entry:", error);
    return { ok: false, message: "Database Error: Failed to schedule entry." };
  }

  revalidateMedical(parsedAnimalId.data);
  return { ok: true, message: "Entry scheduled." };
};

const _editMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: MedicalEntryFormInput,
): Promise<EntryResult> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }
  // What an exam brings when it is recorded is an entry of its own once
  // written: its vitals are corrected on the Vitals page, and the spay or
  // neuter it found on that surgery's entry.
  if (validated.data.kind === MedicalEntryKind.EXAM) {
    const extra = validated.data.vitals
      ? {
          field: "vitals",
          message:
            "Vitals are recorded with a new exam. Correct an exam's vitals on the Vitals page.",
        }
      : validated.data.foundAltered
        ? {
            field: "foundAltered",
            message:
              "A spay or neuter found on an exam is recorded with the exam. Correct it on its own entry.",
          }
        : null;
    if (extra) {
      return {
        ok: false,
        message: extra.message,
        fieldErrors: {
          [extra.field]: [extra.message],
        } as FieldErrors<MedicalEntryFormInput>,
      };
    }
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    const edit = await prisma.$transaction((tx) =>
      editEntry(tx, parsedId.data, validated.data, user.personId, today),
    );
    if (edit.status === "unchanged") {
      return { ok: true, message: NO_OP_EDIT_MESSAGE };
    }
    animalId = edit.animalId;
  } catch (error) {
    // A chip number another animal took at the same moment reads as the
    // service's refusal, naming that animal when it still holds it.
    const refusal = refused<MedicalEntryFormInput>(
      await nameChipNumberHolder(prisma, error),
    );
    if (refusal) return refusal;
    console.error("Database error editing medical entry:", error);
    return { ok: false, message: "Database Error: Failed to update entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry updated." };
};

const _voidMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: VoidMedicalEntryInput,
): Promise<FormResult<VoidMedicalEntryInput>> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = VoidMedicalEntrySchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to void this entry.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<VoidMedicalEntryInput>,
    };
  }

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      voidEntry(tx, parsedId.data, validated.data.reason, user.personId),
    ));
  } catch (error) {
    const refusal = refused<VoidMedicalEntryInput>(error);
    if (refusal) return refusal;
    console.error("Database error voiding medical entry:", error);
    return { ok: false, message: "Database Error: Failed to void entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry voided." };
};

const _rescheduleMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: RescheduleMedicalEntryInput,
): Promise<FormResult<RescheduleMedicalEntryInput>> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = RescheduleMedicalEntrySchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A valid due date is required. The entry was not rescheduled.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<RescheduleMedicalEntryInput>,
    };
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      rescheduleEntry(
        tx,
        parsedId.data,
        validated.data.dueDate,
        user.personId,
        today,
      ),
    ));
  } catch (error) {
    const refusal = refused<RescheduleMedicalEntryInput>(error);
    if (refusal) return refusal;
    console.error("Database error rescheduling medical entry:", error);
    return { ok: false, message: "Database Error: Failed to reschedule entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry rescheduled." };
};

const _declineMedicalEntry = async (
  user: SessionUser,
  entryId: string,
  values: DeclineMedicalEntryInput,
): Promise<FormResult<DeclineMedicalEntryInput>> => {
  const parsedId = cuidSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid entry ID format." };
  }
  const validated = DeclineMedicalEntrySchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "A reason is required to decline this entry.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<DeclineMedicalEntryInput>,
    };
  }


  const { reason, exemptionReason, reviewDate } = validated.data;
  const entry = await prisma.medicalEntry.findUnique({
    where: { id: parsedId.data },
    select: { procedure: true },
  });
  if (!entry) {
    return { ok: false, message: "Medical entry not found." };
  }
  // Declining a spay or neuter sets an exemption, which is planning the
  // animal's care rather than giving it.
  if (
    (entry.procedure === SurgeryProcedure.SPAY ||
      entry.procedure === SurgeryProcedure.NEUTER) &&
    !can(user.role, AppPermissions.MEDICAL_MANAGE)
  ) {
    return {
      ok: false,
      message: "You don't have permission to record a spay/neuter exemption.",
    };
  }

  const today = await getShelterToday();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      declineEntry(
        tx,
        parsedId.data,
        reason,
        user.personId,
        exemptionReason ? { exemptionReason, reviewDate, today } : null,
      ),
    ));
  } catch (error) {
    const refusal = refused<DeclineMedicalEntryInput>(error);
    if (refusal) return refusal;
    console.error("Database error declining medical entry:", error);
    return { ok: false, message: "Database Error: Failed to decline entry." };
  }

  revalidateMedical(animalId);
  return { ok: true, message: "Entry declined." };
};

const _recordSpayNeuterExemption = async (
  user: SessionUser,
  animalId: string,
  values: RecordSpayNeuterExemptionFormInput,
): Promise<FormResult<RecordSpayNeuterExemptionFormInput>> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = RecordSpayNeuterExemptionSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. The exemption was not recorded.",
      fieldErrors: z.flattenError(validated.error)
        .fieldErrors as FieldErrors<RecordSpayNeuterExemptionFormInput>,
    };
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      recordExemption(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<RecordSpayNeuterExemptionFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording a spay/neuter exemption:", error);
    return { ok: false, message: "Database Error: Failed to record the exemption." };
  }

  revalidateMedical(parsedAnimalId.data);
  return { ok: true, message: "Exemption recorded." };
};

/**
 * What a batch action returns: how many entries it wrote, or, when any
 * animal was refused, each refused animal and why. Nothing is written then.
 */
export type MedicalBatchActionResult<TValues> =
  | ActionSuccess<{ written: number; nextScheduled: number }>
  | (ActionFailure<TValues> & { refusals?: MedicalBatchAnimalRefusal[] });

// A batch writes an entry, its event and its activity row for up to 50
// animals, each behind its own lock, which can pass the default five
// seconds against a remote database.
const BATCH_TRANSACTION = { timeout: 30_000 };

const plural = (count: number, noun: string, nouns = `${noun}s`) =>
  `${count} ${count === 1 ? noun : nouns}`;

// "Next dose scheduled for 2. 1 already had one planned."
const nextDoseText = (result: MedicalBatchResult, asked: boolean) => {
  if (!asked) return "";
  const next = result.entries.filter((entry) => entry.nextEntryId).length;
  const planned = result.entries.length - next;
  return `${next > 0 ? ` Next dose scheduled for ${next}.` : ""}${
    planned > 0 ? ` ${planned} already had one planned.` : ""
  }`;
};

const batchRefused = <TValues>(
  error: unknown,
): MedicalBatchActionResult<TValues> | null =>
  error instanceof MedicalBatchRefusal
    ? { ok: false, message: error.message, refusals: error.refusals }
    : refused<TValues>(error);

const revalidateBatch = (result: MedicalBatchResult) => {
  for (const animalId of new Set(result.entries.map((entry) => entry.animalId))) {
    revalidateMedical(animalId);
  }
};

const batchSucceeded = (
  result: MedicalBatchResult,
  message: string,
): MedicalBatchActionResult<never> => ({
  ok: true,
  message,
  data: {
    written: result.entries.length,
    nextScheduled: result.entries.filter((entry) => entry.nextEntryId).length,
  },
});

const _recordMedicalBatch = async (
  user: SessionUser,
  values: MedicalBatchFormInput,
): Promise<MedicalBatchActionResult<MedicalBatchFormInput>> => {
  const validated = MedicalBatchSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Nothing was saved.",
      fieldErrors: medicalEntryFieldErrors(
        validated.error,
      ) as FieldErrors<MedicalBatchFormInput>,
    };
  }

  const parsed = validated.data;
  let input: MedicalBatchInput;
  if (parsed.mode === "SCHEDULE") {
    const { mode, animals, ...entry } = parsed;
    input = {
      mode,
      animals: animals.map(({ animalId }) => ({ animalId })),
      entry,
    };
  } else {
    const { mode, animals, scheduleNext, ...entry } = parsed;
    input = { mode, animals, entry, scheduleNext };
  }

  const today = await getShelterToday();
  let result: MedicalBatchResult;
  try {
    result = await prisma.$transaction(
      (tx) => recordBatch(tx, input, user.personId, today),
      BATCH_TRANSACTION,
    );
  } catch (error) {
    const refusal = batchRefused<MedicalBatchFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording a medical batch:", error);
    return { ok: false, message: "Database Error: Failed to save the batch." };
  }

  revalidateBatch(result);
  const count = plural(result.entries.length, "animal");
  return batchSucceeded(
    result,
    input.mode === "SCHEDULE"
      ? `Scheduled for ${count}.`
      : `Recorded for ${count}.${nextDoseText(result, !!input.scheduleNext)}`,
  );
};

const _recordScheduledMedicalBatch = async (
  user: SessionUser,
  values: RecordScheduledBatchFormInput,
): Promise<MedicalBatchActionResult<RecordScheduledBatchFormInput>> => {
  const validated = RecordScheduledBatchSchema.safeParse(values);
  if (!validated.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Nothing was recorded.",
      fieldErrors: medicalEntryFieldErrors(
        validated.error,
      ) as FieldErrors<RecordScheduledBatchFormInput>,
    };
  }
  const { entries, scheduleNext, ...details } = validated.data;

  const today = await getShelterToday();
  let result: MedicalBatchResult;
  try {
    result = await prisma.$transaction(
      (tx) =>
        recordScheduledBatch(
          tx,
          { entries, details, scheduleNext },
          user.personId,
          today,
        ),
      BATCH_TRANSACTION,
    );
  } catch (error) {
    const refusal = batchRefused<RecordScheduledBatchFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording scheduled medical care:", error);
    return { ok: false, message: "Database Error: Failed to record the entries." };
  }

  revalidateBatch(result);
  return batchSucceeded(
    result,
    `Recorded ${plural(result.entries.length, "entry", "entries")} as given.${nextDoseText(result, !!scheduleNext)}`,
  );
};

const _loadMedicalEntryFormOptions = async (
  _user: SessionUser,
  animalId: string,
): Promise<
  { ok: true; options: MedicalEntryFormOptions } | { ok: false; message: string }
> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  try {
    return {
      ok: true,
      options: await fetchMedicalEntryFormOptions(parsedAnimalId.data),
    };
  } catch (error) {
    console.error("Error loading medical entry form options:", error);
    return { ok: false, message: "Could not load the form. Try again." };
  }
};

const _loadScheduledBatchFormOptions = async (
  _user: SessionUser,
  itemId: string,
): Promise<
  | { ok: true; options: ScheduledBatchFormOptions }
  | { ok: false; message: string }
> => {
  const parsedItemId = cuidSchema.safeParse(itemId);
  if (!parsedItemId.success) {
    return { ok: false, message: "Invalid item ID format." };
  }
  try {
    const options = await fetchScheduledBatchFormOptions(parsedItemId.data);
    return options
      ? { ok: true, options }
      : { ok: false, message: "That catalog item no longer exists." };
  } catch (error) {
    console.error("Error loading the scheduled batch form options:", error);
    return { ok: false, message: "Could not load the form. Try again." };
  }
};

export const recordMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_recordMedicalEntry),
);

// Giving care that is already scheduled, which needs less than planning it.
// Its "schedule the next one" is part of the same record.
export const recordScheduledMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(
    _recordScheduledMedicalEntry,
  ),
);

export const scheduleMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_scheduleMedicalEntry),
);

export const editMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_editMedicalEntry),
);

export const voidMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_voidMedicalEntry),
);

export const rescheduleMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_rescheduleMedicalEntry),
);

// Declining care already scheduled is part of giving it, not of planning it,
// except a spay or neuter: that sets an exemption, and also needs
// MEDICAL_MANAGE (checked inside, once the entry is read).
export const declineMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(_declineMedicalEntry),
);

// An exemption sets what the animal's care will be, so it is planning.
export const recordSpayNeuterExemption = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_recordSpayNeuterExemption),
);

// The same care for several animals at once, given or scheduled: planning
// and recording ad hoc, as for one animal.
export const recordMedicalBatch = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_MANAGE)(_recordMedicalBatch),
);

// Giving several animals care already scheduled for them.
export const recordScheduledMedicalBatch = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(
    _recordScheduledMedicalBatch,
  ),
);

// What the record form offers for one animal, read when the form opens on a
// page that lists many animals' care, rather than for every row up front.
// Behind the same permission as giving scheduled care.
export const loadMedicalEntryFormOptions = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(
    _loadMedicalEntryFormOptions,
  ),
);

// What the form recording several scheduled entries for one item offers,
// read when it opens. Behind the same permission as giving scheduled care.
export const loadScheduledBatchFormOptions = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(
    _loadScheduledBatchFormOptions,
  ),
);
