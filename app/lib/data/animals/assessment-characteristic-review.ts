import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  summarizeAssessmentCharacteristics,
  type ActiveCharacteristicAssignment,
  type AssessmentCharacteristicsSummary,
  type RecordedAssessment,
} from "../../assessments/proposals";

// Server-side only, and deliberately unguarded: every caller (the assessment
// page's data fetch, the assessments list, the characteristics tab's data
// fetch, the record/edit and suggestion actions) has already checked
// permissions. Accepts a transaction client so an action can read the state
// it just wrote.
type Db = TransactionClient | typeof prisma;

/**
 * What an assessment row needs to carry for its findings to be judged: the
 * proposing fields of the template version it was recorded on, and its
 * answers. Spread into any assessment `select`.
 */
export const RECORDED_FINDINGS_SELECT = {
  id: true,
  observedAt: true,
  template: {
    select: {
      name: true,
      fields: {
        where: { proposesCharacteristicId: { not: null } },
        select: {
          key: true,
          label: true,
          concerningValues: true,
          proposesOnValues: true,
          proposesCharacteristic: {
            select: { id: true, name: true, deletedAt: true },
          },
        },
      },
    },
  },
  answers: {
    select: {
      value: true,
      templateField: { select: { key: true } },
    },
  },
} satisfies Prisma.AssessmentSelect;

type RecordedFindingsRow = Prisma.AssessmentGetPayload<{
  select: typeof RECORDED_FINDINGS_SELECT;
}>;

export const toRecordedAssessment = (
  row: RecordedFindingsRow,
): RecordedAssessment => ({
  id: row.id,
  templateName: row.template.name,
  observedAt: row.observedAt,
  fields: row.template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    concerningValues: f.concerningValues,
    proposesOnValues: f.proposesOnValues,
    // A trait retired from the catalog is no longer proposed or argued with.
    proposes:
      f.proposesCharacteristic && !f.proposesCharacteristic.deletedAt
        ? {
            id: f.proposesCharacteristic.id,
            name: f.proposesCharacteristic.name,
          }
        : null,
  })),
  answers: row.answers.map((a) => ({
    fieldKey: a.templateField.key,
    value: a.value,
  })),
});

/** The animal's active assignments of catalog traits that aren't retired —
 *  the same set the characteristics tab shows. */
export const fetchActiveAssignments = async (
  db: Db,
  animalId: string,
): Promise<ActiveCharacteristicAssignment[]> => {
  const rows = await db.animalCharacteristic.findMany({
    where: { animalId, removedAt: null, characteristic: { deletedAt: null } },
    select: {
      characteristicId: true,
      sourceAssessmentId: true,
      characteristic: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    characteristicId: r.characteristicId,
    characteristicName: r.characteristic.name,
    sourceAssessmentId: r.sourceAssessmentId,
  }));
};

/**
 * The animal's live assessments, newest observation first. A deleted
 * assessment no longer speaks for the animal: it proposes and contradicts
 * nothing, and supersedes nothing.
 */
export const fetchLiveAssessments = async (
  db: Db,
  animalId: string,
): Promise<RecordedAssessment[]> => {
  const rows = await db.assessment.findMany({
    where: { animalId, deletedAt: null },
    orderBy: [{ observedAt: "desc" }, { id: "asc" }],
    select: RECORDED_FINDINGS_SELECT,
  });
  return rows.map(toRecordedAssessment);
};

/** Everything one of the animal's assessments is measured against. */
export const fetchAnimalFindings = async (db: Db, animalId: string) => {
  const [assignments, liveAssessments] = await Promise.all([
    fetchActiveAssignments(db, animalId),
    fetchLiveAssessments(db, animalId),
  ]);
  return { assignments, liveAssessments };
};

export type AnimalFindings = Awaited<ReturnType<typeof fetchAnimalFindings>>;

/** One assessment's recorded findings, known by id; null if it isn't the
 *  animal's. */
export const fetchRecordedAssessment = async (
  db: Db,
  animalId: string,
  assessmentId: string,
) => {
  const row = await db.assessment.findFirst({
    where: { id: assessmentId, animalId },
    select: { ...RECORDED_FINDINGS_SELECT, deletedAt: true },
  });
  return row
    ? { recorded: toRecordedAssessment(row), deletedAt: row.deletedAt }
    : null;
};

/** What an assessment's findings suggest, known by id — what the page and
 *  the suggestion action need. */
export const loadAssessmentCharacteristicsSummary = async (
  db: Db,
  animalId: string,
  assessmentId: string,
): Promise<
  (AssessmentCharacteristicsSummary & {
    assessment: RecordedAssessment;
    deletedAt: Date | null;
  }) | null
> => {
  const found = await fetchRecordedAssessment(db, animalId, assessmentId);
  if (!found) return null;

  const findings = await fetchAnimalFindings(db, animalId);
  const summary = summarizeAssessmentCharacteristics({
    assessment: found.recorded,
    deleted: found.deletedAt !== null,
    ...findings,
  });
  return { ...summary, assessment: found.recorded, deletedAt: found.deletedAt };
};
