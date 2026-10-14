import { format, parseISO } from "date-fns";
import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  CareEpisodeEventAction,
  CareEpisodeType,
} from "@/prisma/generated/enums";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { beforeIntakeIssue, futureDayIssue } from "@/app/lib/utils/medical-days";
import { careEpisodeText } from "@/app/lib/utils/care-status";
import {
  CARE_EPISODE_TYPE_LABELS,
  MEDICAL_REASON_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import { MedicalEntryRefusal, tidy } from "@/app/lib/services/medical-entry-values";
import {
  checkVetClinic,
  readAnimal,
  type AnimalFacts,
} from "@/app/lib/services/medical-entry";
import {
  dayText,
  describeProseChange,
  describeValueChange,
  joinList,
} from "@/app/lib/services/medical-entry-text";

/**
 * An animal's care episodes: opening one (or recording one already over),
 * closing it, correcting it, and voiding one recorded in error.
 *
 * An episode is always recorded, never inferred from where the animal is
 * housed. An animal has at most one open episode, and its episodes don't
 * overlap, though one may start on the day the last one ended: a change of
 * type closes one episode and opens another. An episode starts on or after
 * the animal's latest intake, and a stay at a clinic names the clinic.
 *
 * Every change writes an event holding the values it changed, as a medical
 * entry's do, and a line in the animal's activity feed. A void is written
 * once and never undone; a voided episode is kept and counts for nothing.
 *
 * Every write takes the animal's lock first, so the one-open and no-overlap
 * rules are checked against what any other write to the animal committed; a
 * partial unique index backs the first. Like the entry service, this module
 * has **no `next/*` and no auth imports**, so the seed and the database tests
 * can drive it. It runs inside the caller's `prisma.$transaction`, and takes
 * the shelter's today as an argument.
 */

/** An episode as a form or a caller gives it. */
export interface CareEpisodeInput {
  type: CareEpisodeType;
  startDate: CalendarDay;
  /** Given for an episode recorded already over; null while it is open. */
  endDate?: CalendarDay | null;
  reason: string;
  /** The vet clinic: required off site, refused in house. */
  partnerId?: string | null;
  notes?: string | null;
}

/** A correction. A field left out keeps what is stored, and `null` clears it. */
export type CareEpisodeCorrection = Partial<CareEpisodeInput>;

export type CareEpisodeEdit =
  | { status: "edited"; episodeId: string; animalId: string; changeSummary: string }
  | { status: "unchanged"; episodeId: string; animalId: string };

/** What an episode stores, flat and keyed by field name, as its events record it. */
interface EpisodeValues {
  type: CareEpisodeType;
  startDate: CalendarDay;
  endDate: CalendarDay | null;
  reason: string;
  partnerId: string | null;
  notes: string | null;
}

type EpisodeField = keyof EpisodeValues;

// In the order a correction's text lists them.
const FIELDS: EpisodeField[] = [
  "type",
  "startDate",
  "endDate",
  "partnerId",
  "reason",
  "notes",
];

const EPISODE_SELECT = {
  type: true,
  startDate: true,
  endDate: true,
  reason: true,
  partnerId: true,
  notes: true,
} as const;

interface StoredEpisodeRow {
  type: CareEpisodeType;
  startDate: string;
  endDate: string | null;
  reason: string;
  partnerId: string | null;
  notes: string | null;
}

/** A stored episode's values, its days read as days. */
const asValues = (row: StoredEpisodeRow): EpisodeValues => ({
  type: row.type,
  startDate: calendarDay(row.startDate),
  endDate: row.endDate ? calendarDay(row.endDate) : null,
  reason: row.reason,
  partnerId: row.partnerId,
  notes: row.notes,
});

const asJson = (value: object) => value as Prisma.InputJsonObject;

// ---------------------------------------------------------------------------
// The text
// ---------------------------------------------------------------------------

// "Oct 3 to Oct 9, 2026", "Sep 28, 2026 to Jan 2, 2027" or "on Oct 3, 2026".
const spanText = (start: CalendarDay, end: CalendarDay) =>
  start === end
    ? `on ${dayText(start)}`
    : `${start.slice(0, 4) === end.slice(0, 4) ? format(parseISO(start), "MMM d") : dayText(start)} to ${dayText(end)}`;

const readClinicName = async (tx: TransactionClient, partnerId: string | null) =>
  partnerId
    ? ((
        await tx.partner.findUnique({
          where: { id: partnerId },
          select: { name: true },
        })
      )?.name ?? null)
    : null;

/**
 * "hospitalised in house since Oct 3, 2026" for an open episode, or
 * "hospitalised in house, Oct 3 to Oct 9, 2026" for one that ended. `from`
 * says "from" in place of "since", for an episode just opened.
 */
const episodeText = async (
  tx: TransactionClient,
  values: Pick<EpisodeValues, "type" | "startDate" | "endDate" | "partnerId">,
  open: "since" | "from" = "since",
) => {
  const care = careEpisodeText(values.type, await readClinicName(tx, values.partnerId));
  return values.endDate
    ? `${care}, ${spanText(values.startDate, values.endDate)}`
    : `${care} ${open} ${dayText(values.startDate)}`;
};

const FIELD_LABELS: Record<Exclude<EpisodeField, "reason" | "notes">, string> = {
  type: "type",
  startDate: "start date",
  endDate: "end date",
  partnerId: "clinic",
};

const displayValue = async (
  tx: TransactionClient,
  field: Exclude<EpisodeField, "reason" | "notes">,
  values: EpisodeValues,
): Promise<string | null> => {
  switch (field) {
    case "type":
      return CARE_EPISODE_TYPE_LABELS[values.type].toLowerCase();
    case "startDate":
    case "endDate":
      return values[field] ? dayText(values[field]) : null;
    case "partnerId":
      return readClinicName(tx, values.partnerId);
  }
};

const describeChange = async (
  tx: TransactionClient,
  field: EpisodeField,
  before: EpisodeValues,
  after: EpisodeValues,
) => {
  switch (field) {
    case "notes":
      return describeProseChange("notes", before.notes, after.notes);
    // A reason is always there, and can run long.
    case "reason":
      return "the reason was edited";
    default:
      return describeValueChange(
        FIELD_LABELS[field],
        // One after another: a transaction is one connection.
        await displayValue(tx, field, before),
        await displayValue(tx, field, after),
      );
  }
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** The values a write would store: the input over what is stored, if any. */
const valuesFor = (
  input: CareEpisodeCorrection,
  before: EpisodeValues | null,
): EpisodeValues => {
  const kept = <F extends EpisodeField>(field: F): EpisodeValues[F] | null =>
    input[field] === undefined
      ? (before?.[field] ?? null)
      : (input[field] as EpisodeValues[F] | null);
  return {
    type: kept("type")!,
    startDate: kept("startDate")!,
    endDate: kept("endDate"),
    reason: input.reason === undefined ? before!.reason : (tidy(input.reason) ?? ""),
    partnerId: kept("partnerId") || null,
    notes: input.notes === undefined ? (before?.notes ?? null) : tidy(input.notes),
  };
};

const checkReason = (reason: string) => {
  if (!reason) {
    throw new MedicalEntryRefusal("Say why the animal is under care.", "reason");
  }
  if (reason.length > MEDICAL_REASON_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The reason can't be longer than ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      "reason",
    );
  }
};

/**
 * An episode starts on or after the animal's latest intake, and neither day
 * is in the future. One that ended did so on or after the day it started.
 */
const checkDays = (
  { startDate, endDate }: EpisodeValues,
  animal: AnimalFacts,
  today: CalendarDay,
) => {
  const startIssue =
    futureDayIssue(startDate, today, "The start date") ??
    beforeIntakeIssue(startDate, animal.latestIntakeDate, "The start date");
  if (startIssue) {
    throw new MedicalEntryRefusal(startIssue, "startDate");
  }
  if (!endDate) return;
  const endIssue =
    futureDayIssue(endDate, today, "The end date") ??
    (endDate < startDate ? "The end date can't be before the start date." : null);
  if (endIssue) {
    throw new MedicalEntryRefusal(endIssue, "endDate");
  }
};

/**
 * A stay at a clinic names it, a stay at the shelter has none, and vet care
 * may name the outside vet's clinic. The clinic is checked when it is picked
 * or changed, so an episode keeps a clinic made inactive since.
 */
const checkClinic = async (
  tx: TransactionClient,
  { type, partnerId }: EpisodeValues,
  changed: boolean,
) => {
  if (type === CareEpisodeType.HOSPITALISED_OFF_SITE && !partnerId) {
    throw new MedicalEntryRefusal(
      "Pick the clinic the animal is hospitalised at.",
      "partnerId",
    );
  }
  if (type === CareEpisodeType.HOSPITALISED_IN_HOUSE && partnerId) {
    throw new MedicalEntryRefusal(
      "A stay in house has no clinic.",
      "partnerId",
    );
  }
  if (partnerId && changed) {
    await checkVetClinic(tx, partnerId, "partnerId");
  }
};

/**
 * At most one open episode, and no two that overlap. Two episodes touch,
 * rather than overlap, when one ends on the day the other starts.
 */
const checkAgainstOthers = async (
  tx: TransactionClient,
  animalId: string,
  values: EpisodeValues,
  episodeId: string | null,
) => {
  const others = (
    await tx.careEpisode.findMany({
      where: {
        animalId,
        voidedAt: null,
        ...(episodeId ? { id: { not: episodeId } } : {}),
      },
      select: EPISODE_SELECT,
      orderBy: { startDate: "asc" },
    })
  ).map(asValues);

  const open = others.find((other) => other.endDate === null);
  if (open && values.endDate === null) {
    const animal = await tx.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { name: true },
    });
    throw new MedicalEntryRefusal(
      `${animal.name} already has an open care episode (${await episodeText(tx, open)}). Close it first.`,
      "startDate",
    );
  }

  const { startDate, endDate } = values;
  const clash = others.find(
    (other) =>
      (other.endDate === null || startDate < other.endDate) &&
      (endDate === null || other.startDate < endDate),
  );
  if (clash) {
    // The start falls inside the other episode, or the span reaches into it.
    const field =
      clash.startDate <= startDate ? "startDate" : "endDate";
    throw new MedicalEntryRefusal(
      `This overlaps another care episode (${await episodeText(tx, clash)}). An animal's episodes don't overlap, though one may start on the day another ended.`,
      field,
    );
  }
};

/** Every rule a write runs; the clinic is read only when it is new or changed. */
const checkValues = async (
  tx: TransactionClient,
  animalId: string,
  values: EpisodeValues,
  animal: AnimalFacts,
  today: CalendarDay,
  stored: { episodeId: string; values: EpisodeValues } | null,
) => {
  checkReason(values.reason);
  checkDays(values, animal, today);
  await checkClinic(
    tx,
    values,
    !stored || values.partnerId !== stored.values.partnerId,
  );
  await checkAgainstOthers(tx, animalId, values, stored?.episodeId ?? null);
};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

/**
 * Opens a care episode, or records one already over when it is given an end
 * day. Only an animal in the shelter's care has episodes opened; closing,
 * correcting and voiding work after it leaves.
 */
export async function openCareEpisode(
  tx: TransactionClient,
  input: CareEpisodeInput & { animalId: string },
  actorId: string,
  today: CalendarDay,
): Promise<{ episodeId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so no care episode can be opened for it.",
    );
  }
  const values = valuesFor(input, null);
  await checkValues(tx, animalId, values, animal, today, null);

  const { id: episodeId } = await tx.careEpisode.create({
    data: {
      ...values,
      animalId,
      openedById: actorId,
      closedById: values.endDate ? actorId : null,
    },
    select: { id: true },
  });
  await tx.careEpisodeEvent.create({
    data: {
      episodeId,
      action: CareEpisodeEventAction.OPENED,
      actorId,
      after: asJson(values),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.CARE_EPISODE_OPENED,
      changedById: actorId,
      changeSummary: `Care episode ${values.endDate ? "recorded" : "opened"}: ${await episodeText(tx, values, "from")}. Reason: ${values.reason}`,
    },
  });

  return { episodeId, animalId };
}

// An episode's animal never changes, so it can be read before the lock.
const locateEpisode = async (tx: TransactionClient, episodeId: string) => {
  const located = await tx.careEpisode.findUnique({
    where: { id: episodeId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Care episode not found.");
  }
  return located.animalId;
};

const readEpisode = (tx: TransactionClient, episodeId: string) =>
  tx.careEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    select: { ...EPISODE_SELECT, voidedAt: true },
  });

/** Closes an open episode on `endDate`. */
export async function closeCareEpisode(
  tx: TransactionClient,
  episodeId: string,
  endDate: CalendarDay,
  actorId: string,
  today: CalendarDay,
): Promise<{ episodeId: string; animalId: string }> {
  const animalId = await locateEpisode(tx, episodeId);
  await lockAnimal(tx, animalId);

  const stored = await readEpisode(tx, episodeId);
  if (stored.voidedAt) {
    throw new ConflictError("This care episode was voided, so it can't be closed.");
  }
  if (stored.endDate) {
    throw new ConflictError("This care episode is already closed.");
  }
  const before = asValues(stored);
  const after = { ...before, endDate };
  const animal = await readAnimal(tx, animalId);
  await checkValues(tx, animalId, after, animal, today, {
    episodeId,
    values: before,
  });

  await tx.careEpisode.update({
    where: { id: episodeId },
    data: { endDate, closedById: actorId },
  });
  await tx.careEpisodeEvent.create({
    data: {
      episodeId,
      action: CareEpisodeEventAction.CLOSED,
      actorId,
      before: { endDate: null },
      after: { endDate },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.CARE_EPISODE_CLOSED,
      changedById: actorId,
      changeSummary: `Care episode closed: ${await episodeText(tx, after)}.`,
    },
  });

  return { episodeId, animalId };
}

/**
 * Corrects an episode in place, and writes an EDITED event holding the
 * before and after values of only what changed. Every rule runs again.
 * Clearing the end day reopens the episode, which the one-open rule then
 * holds to; setting one on an open episode ends it. A correction that changes
 * nothing writes nothing.
 */
export async function editCareEpisode(
  tx: TransactionClient,
  episodeId: string,
  input: CareEpisodeCorrection,
  actorId: string,
  today: CalendarDay,
): Promise<CareEpisodeEdit> {
  const animalId = await locateEpisode(tx, episodeId);
  await lockAnimal(tx, animalId);

  const stored = await readEpisode(tx, episodeId);
  if (stored.voidedAt) {
    throw new ConflictError(
      "This care episode was voided, so it can't be edited. Open it again instead.",
    );
  }
  const before = asValues(stored);
  const after = valuesFor(input, before);
  const changed = FIELDS.filter((field) => after[field] !== before[field]);
  if (changed.length === 0) {
    return { status: "unchanged", episodeId, animalId };
  }

  const animal = await readAnimal(tx, animalId);
  await checkValues(tx, animalId, after, animal, today, {
    episodeId,
    values: before,
  });

  const pick = (values: EpisodeValues) =>
    Object.fromEntries(changed.map((field) => [field, values[field]]));
  // Who closed it follows the end day: whoever last set it, or nobody once
  // it is open again.
  const closedBy = changed.includes("endDate")
    ? { closedById: after.endDate ? actorId : null }
    : {};
  await tx.careEpisode.update({
    where: { id: episodeId },
    data: { ...pick(after), ...closedBy },
  });
  await tx.careEpisodeEvent.create({
    data: {
      episodeId,
      action: CareEpisodeEventAction.EDITED,
      actorId,
      before: asJson(pick(before)),
      after: asJson(pick(after)),
    },
  });
  const changes: string[] = [];
  for (const field of changed) {
    changes.push(await describeChange(tx, field, before, after));
  }
  const changeSummary = `Care episode was corrected: ${joinList(changes)}.`;
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.CARE_EPISODE_EDITED,
      changedById: actorId,
      changeSummary,
    },
  });

  return { status: "edited", episodeId, animalId, changeSummary };
}

/**
 * Voids an episode recorded in error. Write-once: an episode already voided
 * is refused, and nothing un-voids one. A voided episode no longer counts as
 * open, so another can be opened.
 */
export async function voidCareEpisode(
  tx: TransactionClient,
  episodeId: string,
  reason: string,
  actorId: string,
): Promise<{ episodeId: string; animalId: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new MedicalEntryRefusal(
      "A reason for voiding this care episode is required.",
      "reason",
    );
  }

  const animalId = await locateEpisode(tx, episodeId);
  // Taken before the re-read, so two voids of one episode at once can't both
  // see it live.
  await lockAnimal(tx, animalId);
  const stored = await readEpisode(tx, episodeId);
  if (stored.voidedAt) {
    throw new ConflictError(
      "This care episode has already been voided. A void can't be undone: if it was voided by mistake, open it again.",
    );
  }

  await tx.careEpisode.update({
    where: { id: episodeId },
    data: { voidedAt: new Date(), voidedById: actorId, voidReason: trimmedReason },
  });
  await tx.careEpisodeEvent.create({
    data: {
      episodeId,
      action: CareEpisodeEventAction.VOIDED,
      actorId,
      after: { voidReason: trimmedReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.CARE_EPISODE_VOIDED,
      changedById: actorId,
      changeSummary: `Care episode (${await episodeText(tx, asValues(stored), "from")}) was voided. Reason: ${trimmedReason}`,
    },
  });

  return { episodeId, animalId };
}
