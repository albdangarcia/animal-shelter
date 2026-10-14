// How an animal's problem list and care episodes are ordered and worded on a
// page. Pure, so the Conditions page, History and the unit tests read them
// the same way.

import {
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryKind,
  type CareEpisodeType,
  type ExamType,
} from "@/prisma/generated/enums";
import {
  EXAM_TYPE_LABELS,
  MEDICAL_CONDITION_TYPE_LABELS,
} from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { careEpisodeText } from "@/app/lib/utils/care-status";

/** What a problem-list row is sorted by. */
interface ProblemListOrderRow {
  id: string;
  type: MedicalConditionType;
  name: string;
  status: MedicalConditionStatus;
  voidedAt: Date | null;
}

// Allergies come first, since anyone handling the animal must not miss them;
// then the conditions it lives with; then what is over, then what was entered
// in error.
const problemGroup = (row: ProblemListOrderRow) => {
  if (row.voidedAt) return 3;
  if (row.status === MedicalConditionStatus.RESOLVED) return 2;
  return row.type === MedicalConditionType.ALLERGY ? 0 : 1;
};

/**
 * The problem list in the order the Conditions page shows it: active and
 * chronic allergies, active and chronic conditions, resolved rows of either
 * type, then voided ones. By name within each group.
 */
export const problemListOrder = <T extends ProblemListOrderRow>(rows: T[]): T[] =>
  [...rows].sort(
    (a, b) =>
      problemGroup(a) - problemGroup(b) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );

/** What a care episode is sorted by. */
interface EpisodeOrderRow {
  id: string;
  startDate: string;
  endDate: string | null;
  voidedAt: Date | null;
  createdAt: Date;
}

/** An episode the animal is under now: no end day, and not voided. */
export const isOpenEpisode = (row: Pick<EpisodeOrderRow, "endDate" | "voidedAt">) =>
  row.endDate === null && row.voidedAt === null;

/**
 * Care episodes in the order the Conditions page shows them: the open one
 * first, then the rest by start day, newest first, voided ones among them.
 */
export const careEpisodeOrder = <T extends EpisodeOrderRow>(rows: T[]): T[] =>
  [...rows].sort(
    (a, b) =>
      Number(isOpenEpisode(b)) - Number(isOpenEpisode(a)) ||
      b.startDate.localeCompare(a.startDate) ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.id.localeCompare(a.id),
  );

/** The test or exam a condition was found on, as far as naming it goes. */
export interface ConditionSourceEntry {
  kind: MedicalEntryKind;
  examType: ExamType | null;
  completedDate: string | null;
  item: { name: string } | null;
}

/**
 * The test or exam a condition was found on, as it follows "Found on the":
 * "Heartworm antigen test of Sep 3, 2026", "intake exam of Aug 1, 2026".
 */
export const conditionSourceText = (entry: ConditionSourceEntry): string => {
  const name =
    entry.kind === MedicalEntryKind.EXAM && entry.examType
      ? EXAM_TYPE_LABELS[entry.examType].toLowerCase()
      : `${entry.item?.name ?? "Unnamed"} test`;
  return `${name} of ${formatShelterDayOrNA(entry.completedDate)}`;
};

/** A problem-list row named for a heading or a button: "Penicillin (allergy)". */
export const conditionLabel = (row: { name: string; type: MedicalConditionType }) =>
  `${row.name} (${MEDICAL_CONDITION_TYPE_LABELS[row.type].toLowerCase()})`;

/**
 * A care episode named for a heading or a button: "Hospitalised in house
 * since Oct 3, 2026", or "Under vet care, Sep 1, 2026 to Sep 5, 2026" once it
 * ended.
 */
export const careEpisodeLabel = (episode: {
  type: CareEpisodeType;
  startDate: string;
  endDate: string | null;
  partner: { name: string } | null;
}) => {
  const care = careEpisodeText(episode.type, episode.partner?.name ?? null);
  const text = episode.endDate
    ? `${care}, ${formatShelterDayOrNA(episode.startDate)} to ${formatShelterDayOrNA(episode.endDate)}`
    : `${care} since ${formatShelterDayOrNA(episode.startDate)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Where a condition stands with the trait it names: whether the animal
 * carries it citing this condition ("CITED"), carries it from elsewhere
 * ("CITE": the condition can be cited for it), or doesn't carry it ("ADD").
 * Null when there is nothing to offer: the condition is voided or resolved,
 * names no trait, or its trait is retired.
 */
export const conditionTraitState = (condition: {
  id: string;
  status: MedicalConditionStatus;
  voidedAt: Date | null;
  characteristicId: string | null;
  characteristic: { deletedAt: Date | null } | null;
  animal: {
    animalCharacteristics: { characteristicId: string; sourceConditionId: string | null }[];
  };
}): "CITED" | "CITE" | "ADD" | null => {
  if (
    condition.voidedAt ||
    condition.status === MedicalConditionStatus.RESOLVED ||
    !condition.characteristicId ||
    !condition.characteristic ||
    condition.characteristic.deletedAt
  ) {
    return null;
  }
  const assignment = condition.animal.animalCharacteristics.find(
    (trait) => trait.characteristicId === condition.characteristicId,
  );
  if (!assignment) return "ADD";
  return assignment.sourceConditionId === condition.id ? "CITED" : "CITE";
};
