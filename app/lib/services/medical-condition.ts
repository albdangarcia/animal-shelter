import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  CharacteristicCategory,
  MedicalConditionEventAction,
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryKind,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { beforeIntakeIssue, futureDayIssue } from "@/app/lib/utils/medical-days";
import {
  EXAM_TYPE_LABELS,
  MEDICAL_CONDITION_NAME_MAX_LENGTH,
  MEDICAL_CONDITION_STATUS_LABELS,
  MEDICAL_CONDITION_TYPE_LABELS,
} from "@/app/lib/constants/medical";
import { MedicalEntryRefusal, tidy } from "@/app/lib/services/medical-entry-values";
import { readAnimal, type AnimalFacts } from "@/app/lib/services/medical-entry";
import {
  dayText,
  describeProseChange,
  describeValueChange,
  joinList,
  subjectText,
} from "@/app/lib/services/medical-entry-text";

/**
 * An animal's problem list: adding a condition or an allergy, correcting
 * one (resolving it and making it active again are corrections of its
 * status), and voiding one recorded in error.
 *
 * A condition's name is free text. It may say which test or exam found it,
 * and which MEDICAL characteristic it stands for. Two live rows of one
 * animal can't share a name and a type: a condition that comes back is made
 * active again rather than added twice.
 *
 * Every change writes an event holding the values it changed, as a medical
 * entry's do, and a line in the animal's activity feed. A void is written
 * once and never undone; a voided row is kept and counts for nothing.
 *
 * Every write takes the animal's lock first, so two people changing one
 * animal's problem list at once are applied one after the other. Like the
 * entry service, this module has **no `next/*` and no auth imports**, so the
 * seed and the database tests can drive it. It runs inside the caller's
 * `prisma.$transaction`, and takes the shelter's today as an argument.
 */

/** A problem-list row as a form or a caller gives it. */
export interface MedicalConditionInput {
  type: MedicalConditionType;
  name: string;
  status: MedicalConditionStatus;
  onsetDate?: CalendarDay | null;
  /** Required when the status is RESOLVED, and refused otherwise. */
  resolvedDate?: CalendarDay | null;
  diagnosedBy?: string | null;
  /** A completed test or exam of the same animal that found it. */
  sourceEntryId?: string | null;
  /** The MEDICAL characteristic it stands for. */
  characteristicId?: string | null;
  notes?: string | null;
}

/**
 * A correction. A field left out keeps what is stored, and `null` clears it,
 * except that a status other than RESOLVED clears a resolved day left out.
 */
export type MedicalConditionCorrection = Partial<MedicalConditionInput>;

export type MedicalConditionEdit =
  | {
      status: "edited";
      conditionId: string;
      animalId: string;
      changeSummary: string;
    }
  | { status: "unchanged"; conditionId: string; animalId: string };

/** What a row stores, flat and keyed by field name, as its events record it. */
interface ConditionValues {
  type: MedicalConditionType;
  name: string;
  status: MedicalConditionStatus;
  onsetDate: CalendarDay | null;
  resolvedDate: CalendarDay | null;
  diagnosedBy: string | null;
  sourceEntryId: string | null;
  characteristicId: string | null;
  notes: string | null;
}

type ConditionField = keyof ConditionValues;

// In the order a correction's text lists them.
const FIELDS: ConditionField[] = [
  "type",
  "name",
  "status",
  "onsetDate",
  "resolvedDate",
  "diagnosedBy",
  "sourceEntryId",
  "characteristicId",
  "notes",
];

const VALUES_SELECT = {
  type: true,
  name: true,
  status: true,
  onsetDate: true,
  resolvedDate: true,
  diagnosedBy: true,
  sourceEntryId: true,
  characteristicId: true,
  notes: true,
} as const;

/** A stored row's values, its days read as days. */
const asValues = (
  row: Omit<ConditionValues, "onsetDate" | "resolvedDate"> & {
    onsetDate: string | null;
    resolvedDate: string | null;
  },
): ConditionValues => ({
  type: row.type,
  name: row.name,
  status: row.status,
  onsetDate: row.onsetDate ? calendarDay(row.onsetDate) : null,
  resolvedDate: row.resolvedDate ? calendarDay(row.resolvedDate) : null,
  diagnosedBy: row.diagnosedBy,
  sourceEntryId: row.sourceEntryId,
  characteristicId: row.characteristicId,
  notes: row.notes,
});

const asJson = (value: object) => value as Prisma.InputJsonObject;

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** The values a write would store: the input over what is stored, if any. */
const valuesFor = (
  input: MedicalConditionCorrection,
  before: ConditionValues | null,
): ConditionValues => {
  const kept = <F extends ConditionField>(field: F): ConditionValues[F] | null =>
    input[field] === undefined
      ? (before?.[field] ?? null)
      : (input[field] as ConditionValues[F] | null);
  const status = kept("status")!;
  return {
    type: kept("type")!,
    name: input.name === undefined ? before!.name : (tidy(input.name) ?? ""),
    status,
    onsetDate: kept("onsetDate"),
    // Making a row active or chronic again clears its resolved day, unless
    // one is given (which is refused).
    resolvedDate:
      input.resolvedDate === undefined && status !== MedicalConditionStatus.RESOLVED
        ? null
        : kept("resolvedDate"),
    diagnosedBy:
      input.diagnosedBy === undefined ? (before?.diagnosedBy ?? null) : tidy(input.diagnosedBy),
    sourceEntryId: kept("sourceEntryId") || null,
    characteristicId: kept("characteristicId") || null,
    notes: input.notes === undefined ? (before?.notes ?? null) : tidy(input.notes),
  };
};

const checkName = (name: string) => {
  if (!name) {
    throw new MedicalEntryRefusal("The name is required.", "name");
  }
  if (name.length > MEDICAL_CONDITION_NAME_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The name can't be longer than ${MEDICAL_CONDITION_NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }
};

/**
 * A resolved row says when it resolved, and no other row does. Neither day
 * is in the future, a row resolves on or after it began, and it can't have
 * resolved before the animal first arrived. It may have begun before then: a
 * condition the animal arrived with.
 */
const checkDays = (
  values: ConditionValues,
  animal: AnimalFacts,
  today: CalendarDay,
) => {
  const { status, onsetDate, resolvedDate } = values;
  if (status === MedicalConditionStatus.RESOLVED && !resolvedDate) {
    throw new MedicalEntryRefusal("Give the day it resolved.", "resolvedDate");
  }
  if (status !== MedicalConditionStatus.RESOLVED && resolvedDate) {
    throw new MedicalEntryRefusal(
      "Only a resolved condition has a resolved date.",
      "resolvedDate",
    );
  }
  const onsetIssue = onsetDate && futureDayIssue(onsetDate, today, "The onset date");
  if (onsetIssue) {
    throw new MedicalEntryRefusal(onsetIssue, "onsetDate");
  }
  if (!resolvedDate) return;
  const resolvedIssue =
    futureDayIssue(resolvedDate, today, "The resolved date") ??
    (onsetDate && resolvedDate < onsetDate
      ? "The resolved date can't be before the onset date."
      : null) ??
    beforeIntakeIssue(resolvedDate, animal.firstIntakeDate, "The resolved date");
  if (resolvedIssue) {
    throw new MedicalEntryRefusal(resolvedIssue, "resolvedDate");
  }
};

/**
 * Two live rows of one animal don't share a name (case ignored) and a type.
 * Compared with `lower()` on both sides: a case-insensitive `equals` is sent
 * as ILIKE, which reads `_`, `%` and a backslash in the name as a pattern.
 */
const checkNotListed = async (
  tx: TransactionClient,
  animalId: string,
  values: ConditionValues,
  conditionId: string | null,
) => {
  const [listed] = await tx.$queryRaw<
    { name: string; status: MedicalConditionStatus }[]
  >`
    SELECT name, status FROM medical_conditions
    WHERE animal_id = ${animalId}
      AND type = ${values.type}::"MedicalConditionType"
      AND voided_at IS NULL
      AND lower(name) = lower(${values.name})
      AND id IS DISTINCT FROM ${conditionId}
    LIMIT 1`;
  if (listed) {
    throw new MedicalEntryRefusal(
      `${listed.name} is already on the problem list.${
        listed.status === MedicalConditionStatus.RESOLVED
          ? " Make it active again instead."
          : ""
      }`,
      "name",
    );
  }
};

/**
 * Where it was found: a test or an exam of this animal, done and not
 * voided. Checked when the source is set or changed, so voiding the source
 * later leaves the row correctable.
 */
const checkSource = async (
  tx: TransactionClient,
  animalId: string,
  sourceEntryId: string,
) => {
  const entry = await tx.medicalEntry.findUnique({
    where: { id: sourceEntryId },
    select: { animalId: true, kind: true, status: true, voidedAt: true },
  });
  const issue =
    !entry || entry.animalId !== animalId
      ? "That test or exam isn't on this animal's record."
      : entry.kind !== MedicalEntryKind.TEST && entry.kind !== MedicalEntryKind.EXAM
        ? "A condition is found on a test or an exam."
        : entry.voidedAt
          ? "That test or exam was voided."
          : entry.status !== MedicalEntryStatus.COMPLETED
            ? "That test or exam hasn't been recorded as done."
            : null;
  if (issue) {
    throw new MedicalEntryRefusal(issue, "sourceEntryId");
  }
};

/** The trait it stands for: a MEDICAL characteristic still in use. */
const checkCharacteristic = async (
  tx: TransactionClient,
  characteristicId: string,
) => {
  const characteristic = await tx.characteristic.findUnique({
    where: { id: characteristicId },
    select: { category: true, deletedAt: true },
  });
  const issue =
    !characteristic || characteristic.category !== CharacteristicCategory.MEDICAL
      ? "Pick a medical characteristic."
      : characteristic.deletedAt
        ? "That characteristic has been retired."
        : null;
  if (issue) {
    throw new MedicalEntryRefusal(issue, "characteristicId");
  }
};

/** Every rule a write runs; the reads run only for what is new or changed. */
const checkValues = async (
  tx: TransactionClient,
  animalId: string,
  values: ConditionValues,
  animal: AnimalFacts,
  today: CalendarDay,
  stored: { conditionId: string; values: ConditionValues } | null,
) => {
  const changed = (field: ConditionField) =>
    !stored || values[field] !== stored.values[field];
  checkName(values.name);
  checkDays(values, animal, today);
  if (changed("name") || changed("type")) {
    await checkNotListed(tx, animalId, values, stored?.conditionId ?? null);
  }
  if (values.sourceEntryId && changed("sourceEntryId")) {
    await checkSource(tx, animalId, values.sourceEntryId);
  }
  if (values.characteristicId && changed("characteristicId")) {
    await checkCharacteristic(tx, values.characteristicId);
  }
};

// ---------------------------------------------------------------------------
// The text
// ---------------------------------------------------------------------------

const lower = (text: string) => text.toLowerCase();

/** "the Heartworm antigen test of Sep 3, 2026", "the intake exam of …". */
const readSourceText = async (
  tx: TransactionClient,
  sourceEntryId: string,
): Promise<string | null> => {
  const entry = await tx.medicalEntry.findUnique({
    where: { id: sourceEntryId },
    select: {
      kind: true,
      examType: true,
      procedure: true,
      completedDate: true,
      item: { select: { name: true } },
    },
  });
  if (!entry) return null;
  const name =
    entry.kind === MedicalEntryKind.EXAM && entry.examType
      ? lower(EXAM_TYPE_LABELS[entry.examType])
      : subjectText(entry);
  return `the ${name} of ${dayText(entry.completedDate)}`;
};

const readCharacteristicName = async (
  tx: TransactionClient,
  characteristicId: string,
) =>
  (
    await tx.characteristic.findUnique({
      where: { id: characteristicId },
      select: { name: true },
    })
  )?.name ?? null;

// "Condition added: Heartworm disease (active, onset Sep 3, 2026). Found on
// the Heartworm antigen test of Sep 3, 2026." or "Allergy added: penicillin."
// An allergy is taken to be active, so only another status is said.
const addedText = async (tx: TransactionClient, values: ConditionValues) => {
  const details = [
    ...(values.type === MedicalConditionType.ALLERGY &&
    values.status === MedicalConditionStatus.ACTIVE
      ? []
      : [lower(MEDICAL_CONDITION_STATUS_LABELS[values.status])]),
    ...(values.onsetDate ? [`onset ${dayText(values.onsetDate)}`] : []),
    ...(values.resolvedDate ? [`resolved ${dayText(values.resolvedDate)}`] : []),
  ];
  const source = values.sourceEntryId
    ? await readSourceText(tx, values.sourceEntryId)
    : null;
  return `${MEDICAL_CONDITION_TYPE_LABELS[values.type]} added: ${values.name}${
    details.length > 0 ? ` (${details.join(", ")})` : ""
  }.${source ? ` Found on ${source}.` : ""}`;
};

const FIELD_LABELS: Record<Exclude<ConditionField, "notes">, string> = {
  type: "type",
  name: "name",
  status: "status",
  onsetDate: "onset date",
  resolvedDate: "resolved date",
  diagnosedBy: "person who diagnosed it",
  sourceEntryId: "source",
  characteristicId: "trait",
};

const displayValue = async (
  tx: TransactionClient,
  field: Exclude<ConditionField, "notes">,
  values: ConditionValues,
): Promise<string | null> => {
  switch (field) {
    case "type":
      return lower(MEDICAL_CONDITION_TYPE_LABELS[values.type]);
    case "status":
      return lower(MEDICAL_CONDITION_STATUS_LABELS[values.status]);
    case "onsetDate":
    case "resolvedDate":
      return values[field] ? dayText(values[field]) : null;
    case "sourceEntryId":
      return values.sourceEntryId ? readSourceText(tx, values.sourceEntryId) : null;
    case "characteristicId":
      return values.characteristicId
        ? readCharacteristicName(tx, values.characteristicId)
        : null;
    default:
      return values[field];
  }
};

const describeChange = async (
  tx: TransactionClient,
  field: ConditionField,
  before: ConditionValues,
  after: ConditionValues,
) =>
  field === "notes"
    ? describeProseChange("notes", before.notes, after.notes)
    : describeValueChange(
        FIELD_LABELS[field],
        // One after another: a transaction is one connection.
        await displayValue(tx, field, before),
        await displayValue(tx, field, after),
      );

// "Heartworm disease was resolved on Oct 20, 2026.", "… was made active
// again." or "… was corrected: the onset date changed from … to …." A
// resolve or a reactivation that corrects other fields too adds "Also
// corrected: …".
const editedText = async (
  tx: TransactionClient,
  changed: ConditionField[],
  before: ConditionValues,
  after: ConditionValues,
) => {
  const wasResolved = before.status === MedicalConditionStatus.RESOLVED;
  const isResolved = after.status === MedicalConditionStatus.RESOLVED;
  const statusText =
    !wasResolved && isResolved
      ? `${after.name} was resolved on ${dayText(after.resolvedDate)}.`
      : wasResolved && !isResolved
        ? `${after.name} was made ${lower(MEDICAL_CONDITION_STATUS_LABELS[after.status])} again.`
        : null;
  const corrected = statusText
    ? changed.filter((field) => field !== "status" && field !== "resolvedDate")
    : changed;
  if (corrected.length === 0) return statusText!;
  const changes: string[] = [];
  for (const field of corrected) {
    changes.push(await describeChange(tx, field, before, after));
  }
  return statusText
    ? `${statusText} Also corrected: ${joinList(changes)}.`
    : `${after.name} was corrected: ${joinList(changes)}.`;
};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

/**
 * Adds a condition or an allergy to an animal's problem list. Only an animal
 * in the shelter's care has rows added; correcting and voiding work after it
 * leaves.
 */
export async function addMedicalCondition(
  tx: TransactionClient,
  input: MedicalConditionInput & { animalId: string },
  actorId: string,
  today: CalendarDay,
): Promise<{ conditionId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so nothing can be added to its problem list.",
    );
  }
  const values = valuesFor(input, null);
  await checkValues(tx, animalId, values, animal, today, null);

  const { id: conditionId } = await tx.medicalCondition.create({
    data: { ...values, animalId, createdById: actorId },
    select: { id: true },
  });
  await tx.medicalConditionEvent.create({
    data: {
      conditionId,
      action: MedicalConditionEventAction.CREATED,
      actorId,
      after: asJson(values),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_CONDITION_ADDED,
      changedById: actorId,
      changeSummary: await addedText(tx, values),
    },
  });

  return { conditionId, animalId };
}

// A row's animal never changes, so it can be read before the lock.
const locateCondition = async (tx: TransactionClient, conditionId: string) => {
  const located = await tx.medicalCondition.findUnique({
    where: { id: conditionId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Condition not found.");
  }
  return located.animalId;
};

/**
 * Corrects a row in place, and writes an EDITED event holding the before and
 * after values of only what changed. Resolving a row, and making it active or
 * chronic again, are corrections of its status. A correction that changes
 * nothing writes nothing.
 */
export async function editMedicalCondition(
  tx: TransactionClient,
  conditionId: string,
  input: MedicalConditionCorrection,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalConditionEdit> {
  const animalId = await locateCondition(tx, conditionId);
  await lockAnimal(tx, animalId);

  const stored = await tx.medicalCondition.findUniqueOrThrow({
    where: { id: conditionId },
    select: { ...VALUES_SELECT, voidedAt: true },
  });
  if (stored.voidedAt) {
    throw new ConflictError(
      "This condition was voided, so it can't be edited. Add it again instead.",
    );
  }
  const before = asValues(stored);
  const after = valuesFor(input, before);
  const changed = FIELDS.filter((field) => after[field] !== before[field]);
  if (changed.length === 0) {
    return { status: "unchanged", conditionId, animalId };
  }

  const animal = await readAnimal(tx, animalId);
  await checkValues(tx, animalId, after, animal, today, {
    conditionId,
    values: before,
  });

  const pick = (values: ConditionValues) =>
    Object.fromEntries(changed.map((field) => [field, values[field]]));
  await tx.medicalCondition.update({
    where: { id: conditionId },
    data: pick(after),
  });
  await tx.medicalConditionEvent.create({
    data: {
      conditionId,
      action: MedicalConditionEventAction.EDITED,
      actorId,
      before: asJson(pick(before)),
      after: asJson(pick(after)),
    },
  });
  const changeSummary = await editedText(tx, changed, before, after);
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_CONDITION_EDITED,
      changedById: actorId,
      changeSummary,
    },
  });

  return { status: "edited", conditionId, animalId, changeSummary };
}

/**
 * Voids a row recorded in error. Write-once: a row already voided is
 * refused, and nothing un-voids one.
 */
export async function voidMedicalCondition(
  tx: TransactionClient,
  conditionId: string,
  reason: string,
  actorId: string,
): Promise<{ conditionId: string; animalId: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new MedicalEntryRefusal(
      "A reason for voiding this condition is required.",
      "reason",
    );
  }

  const animalId = await locateCondition(tx, conditionId);
  // Taken before the re-read, so two voids of one row at once can't both see
  // it live.
  await lockAnimal(tx, animalId);
  const condition = await tx.medicalCondition.findUniqueOrThrow({
    where: { id: conditionId },
    select: { type: true, name: true, voidedAt: true },
  });
  if (condition.voidedAt) {
    throw new ConflictError(
      "This condition has already been voided. A void can't be undone: if it was voided by mistake, add it again.",
    );
  }

  await tx.medicalCondition.update({
    where: { id: conditionId },
    data: { voidedAt: new Date(), voidedById: actorId, voidReason: trimmedReason },
  });
  await tx.medicalConditionEvent.create({
    data: {
      conditionId,
      action: MedicalConditionEventAction.VOIDED,
      actorId,
      after: { voidReason: trimmedReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_CONDITION_VOIDED,
      changedById: actorId,
      changeSummary: `${MEDICAL_CONDITION_TYPE_LABELS[condition.type]} ${condition.name} was voided. Reason: ${trimmedReason}`,
    },
  });

  return { conditionId, animalId };
}
