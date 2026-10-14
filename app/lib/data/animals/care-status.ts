// The care each animal is under, read from its medical record: its open care
// episode, the surgeries it may be recovering from, the exams and surgeries
// scheduled for it, and its problem list. No auth or `next/*` imports, so
// database tests can drive it; the pages and the assistant wrap it with the
// reads they need. What the rows mean on a given day is worked out by the
// pure `app/lib/utils/care-status.ts`.

import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import {
  MedicalEntryKind,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import { RECOVERY_DAYS } from "@/app/lib/constants/medical";
import {
  calendarDay,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  careStatus,
  type CareStatus,
  type CompletedSurgery,
  type OpenCareEpisode,
  type ProblemListRow,
  type ScheduledCare,
} from "@/app/lib/utils/care-status";

type Db = TransactionClient | typeof prisma;

const byAnimal = <T>(animalIds: string[]) =>
  new Map<string, T[]>(animalIds.map((id) => [id, []]));

/**
 * The open episode of each of `animalIds` that has one, read in one query:
 * no end day and not voided. The partial unique index allows at most one
 * per animal.
 */
export const findOpenEpisodes = async (
  db: Db,
  animalIds: string[],
): Promise<Map<string, OpenCareEpisode>> => {
  const rows = await db.careEpisode.findMany({
    where: { animalId: { in: animalIds }, endDate: null, voidedAt: null },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      animalId: true,
      type: true,
      startDate: true,
      partner: { select: { name: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.animalId,
      {
        id: row.id,
        type: row.type,
        startDate: calendarDay(row.startDate),
        clinicName: row.partner?.name ?? null,
      },
    ]),
  );
};

/**
 * Each animal's care status on `today`. One query per table, run one after
 * another, so this is safe inside a transaction. An animal with nothing on
 * record has an empty status.
 */
export const findCareStatus = async (
  db: Db,
  animalIds: string[],
  today: CalendarDay,
): Promise<Map<string, CareStatus>> => {
  const episodes = await findOpenEpisodes(db, animalIds);

  // Only the surgeries still in the recovery window; which of them counts is
  // the pure rule's to say.
  const surgeryRows = await db.medicalEntry.findMany({
    where: {
      animalId: { in: animalIds },
      kind: MedicalEntryKind.SURGERY,
      status: MedicalEntryStatus.COMPLETED,
      voidedAt: null,
      // Days are `yyyy-MM-dd` strings, so they compare as days.
      completedDate: { gte: shiftDayKey(today, -RECOVERY_DAYS), lte: today },
    },
    select: { id: true, animalId: true, procedure: true, completedDate: true },
  });
  const surgeries = byAnimal<CompletedSurgery>(animalIds);
  for (const row of surgeryRows) {
    // A surgery always has its procedure, and the filter matched its day.
    surgeries.get(row.animalId)?.push({
      entryId: row.id,
      procedure: row.procedure!,
      completedDate: calendarDay(row.completedDate!),
    });
  }

  const scheduledRows = await db.medicalEntry.findMany({
    where: {
      animalId: { in: animalIds },
      kind: { in: [MedicalEntryKind.EXAM, MedicalEntryKind.SURGERY] },
      status: MedicalEntryStatus.SCHEDULED,
      voidedAt: null,
    },
    select: {
      id: true,
      animalId: true,
      kind: true,
      procedure: true,
      examType: true,
      dueDate: true,
    },
  });
  const scheduled = byAnimal<ScheduledCare>(animalIds);
  for (const row of scheduledRows) {
    // Scheduled care always has its due day.
    scheduled.get(row.animalId)?.push({
      entryId: row.id,
      kind: row.kind,
      procedure: row.procedure,
      examType: row.examType,
      dueDate: calendarDay(row.dueDate!),
    });
  }

  const problemRows = await db.medicalCondition.findMany({
    where: { animalId: { in: animalIds }, voidedAt: null },
    select: { id: true, animalId: true, type: true, name: true, status: true },
  });
  const problems = byAnimal<ProblemListRow>(animalIds);
  for (const { animalId, ...row } of problemRows) {
    problems.get(animalId)?.push(row);
  }

  return new Map(
    animalIds.map((animalId) => [
      animalId,
      careStatus(
        {
          episode: episodes.get(animalId) ?? null,
          surgeries: surgeries.get(animalId) ?? [],
          scheduled: scheduled.get(animalId) ?? [],
          problems: problems.get(animalId) ?? [],
        },
        today,
      ),
    ]),
  );
};
