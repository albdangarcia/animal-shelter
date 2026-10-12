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
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  DeclineMedicalEntrySchema,
  MedicalBatchSchema,
  MedicalEntryFormSchema,
  RecordScheduledBatchSchema,
  RescheduleMedicalEntrySchema,
  ScheduleMedicalEntrySchema,
  VoidMedicalEntrySchema,
  medicalEntryFieldErrors,
  type DeclineMedicalEntryInput,
  type MedicalBatchFormInput,
  type MedicalEntryFormInput,
  type RecordScheduledBatchFormInput,
  type RescheduleMedicalEntryInput,
  type ScheduleMedicalEntryFormInput,
  type VoidMedicalEntryInput,
} from "../zod-schemas/medical-entry.schemas";
import {
  MedicalEntryRefusal,
  declineMedicalEntry as declineEntry,
  editMedicalEntry as editEntry,
  recordMedicalEntry as recordEntry,
  recordScheduledMedicalEntry as recordScheduledEntry,
  rescheduleMedicalEntry as rescheduleEntry,
  scheduleMedicalEntry as scheduleEntry,
  voidMedicalEntry as voidEntry,
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
import { getShelterToday } from "../data/shelter-settings.data";
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

// The Medical pages, the animal's page for its activity feed, and the
// shelter-wide due list.
const revalidateMedical = (animalId: string) => {
  const animalPath = `/dashboard/animals/${animalId}`;
  revalidatePath(animalPath);
  revalidatePath(`${animalPath}/medical`);
  revalidatePath(`${animalPath}/medical/history`);
  revalidatePath(`${animalPath}/medical/vaccines-tests`);
  revalidatePath("/dashboard/medical/due");
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

const _recordMedicalEntry = async (
  user: SessionUser,
  animalId: string,
  values: MedicalEntryFormInput,
): Promise<EntryResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  const validated = MedicalEntryFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error);
  }

  const today = await getShelterToday();
  try {
    await prisma.$transaction((tx) =>
      recordEntry(
        tx,
        { ...validated.data, animalId: parsedAnimalId.data },
        user.personId,
        today,
      ),
    );
  } catch (error) {
    const refusal = refused<MedicalEntryFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording medical entry:", error);
    return { ok: false, message: "Database Error: Failed to record entry." };
  }

  revalidateMedical(parsedAnimalId.data);
  return { ok: true, message: "Entry recorded." };
};

const _recordScheduledMedicalEntry = async (
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

  const today = await getShelterToday();
  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      recordScheduledEntry(
        tx,
        parsedId.data,
        validated.data,
        user.personId,
        today,
      ),
    ));
  } catch (error) {
    const refusal = refused<MedicalEntryFormInput>(error);
    if (refusal) return refusal;
    console.error("Database error recording scheduled medical entry:", error);
    return { ok: false, message: "Database Error: Failed to record entry." };
  }

  revalidateMedical(animalId);
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
    const refusal = refused<MedicalEntryFormInput>(error);
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

  let animalId: string;
  try {
    ({ animalId } = await prisma.$transaction((tx) =>
      declineEntry(tx, parsedId.data, validated.data.reason, user.personId),
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

// Declining care already scheduled is part of giving it, not of planning it.
export const declineMedicalEntry = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_ADMINISTER)(_declineMedicalEntry),
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
