// What an animal's medical record says about the care it is under right now:
// its open care episode, a surgery it is recovering from, the exam or surgery
// it is waiting for, and its allergies and live conditions. Pure: the reads in
// `app/lib/data/animals/care-status.ts` gather the rows, this works out the
// facts on the shelter's today. Nothing is stored; the banner, readiness, the
// attention queue and the assistant each read these fresh.

import type {
  CareEpisodeType,
  ExamType,
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryKind,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  EXAM_TYPE_LABELS,
  RECOVERY_DAYS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import {
  formatShelterDay,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

/** The episode an animal is under now: one that has no end day and isn't voided. */
export interface OpenCareEpisode {
  id: string;
  type: CareEpisodeType;
  startDate: CalendarDay;
  /** The clinic, for a stay off site or vet care that names one. */
  clinicName: string | null;
}

/** A completed, unvoided surgery with a known day. */
export interface CompletedSurgery {
  entryId: string;
  procedure: SurgeryProcedure;
  completedDate: CalendarDay;
}

/** A scheduled, unvoided exam or surgery. */
export interface ScheduledCare {
  entryId: string;
  kind: MedicalEntryKind;
  procedure: SurgeryProcedure | null;
  examType: ExamType | null;
  dueDate: CalendarDay;
}

/** A live (unvoided) row of the problem list. */
export interface ProblemListRow {
  id: string;
  type: MedicalConditionType;
  name: string;
  status: MedicalConditionStatus;
}

export interface Recovering {
  entryId: string;
  procedure: SurgeryProcedure;
  surgeryDate: CalendarDay;
}

export interface AwaitingCare {
  entryId: string;
  dueDate: CalendarDay;
  /** Due before today. */
  overdue: boolean;
  /** What is awaited, as it follows "Awaiting": "vet exam", "spay",
   *  "surgery (mass removal)". */
  label: string;
}

export interface CareStatus {
  episode: OpenCareEpisode | null;
  recovering: Recovering | null;
  /** The earliest scheduled care of each group. */
  awaiting: {
    exam: AwaitingCare | null;
    surgery: AwaitingCare | null;
    spayNeuter: AwaitingCare | null;
  };
  /** Allergies that are active or chronic, by name. */
  allergies: { id: string; name: string }[];
  /** Conditions that are active or chronic, by name. */
  conditions: { id: string; name: string; status: MedicalConditionStatus }[];
}

/**
 * A surgery done on `surgeryDate` reads as recovering from that day through
 * `RECOVERY_DAYS` days after. Days are `yyyy-MM-dd` strings, so they compare
 * as days.
 */
export const isRecovering = (surgeryDate: CalendarDay, today: CalendarDay) =>
  surgeryDate <= today && surgeryDate >= shiftDayKey(today, -RECOVERY_DAYS);

/** The latest surgery the animal is still recovering from, if any. */
export const recoveringFrom = (
  surgeries: CompletedSurgery[],
  today: CalendarDay,
): Recovering | null => {
  const latest = surgeries
    .filter((surgery) => isRecovering(surgery.completedDate, today))
    .reduce<CompletedSurgery | null>(
      (found, surgery) =>
        !found || surgery.completedDate > found.completedDate ? surgery : found,
      null,
    );
  return latest
    ? {
        entryId: latest.entryId,
        procedure: latest.procedure,
        surgeryDate: latest.completedDate,
      }
    : null;
};

type AwaitingGroup = keyof CareStatus["awaiting"];

const SPAY_NEUTER: readonly SurgeryProcedure[] = ["SPAY", "NEUTER"];

/** Which group scheduled care is awaited in, and what it is called there. */
const awaitedAs = (
  care: ScheduledCare,
): { group: AwaitingGroup; label: string } | null => {
  if (care.kind === "EXAM" && care.examType) {
    return { group: "exam", label: EXAM_TYPE_LABELS[care.examType].toLowerCase() };
  }
  if (care.kind === "SURGERY" && care.procedure) {
    const procedure = SURGERY_PROCEDURE_LABELS[care.procedure].toLowerCase();
    return SPAY_NEUTER.includes(care.procedure)
      ? { group: "spayNeuter", label: procedure }
      : { group: "surgery", label: `surgery (${procedure})` };
  }
  return null;
};

/**
 * The earliest scheduled exam, spay or neuter, and other surgery. On a tie
 * the entry's id settles it, so the answer doesn't depend on the read's order.
 */
export const awaitingCare = (
  scheduled: ScheduledCare[],
  today: CalendarDay,
): CareStatus["awaiting"] => {
  const awaiting: CareStatus["awaiting"] = {
    exam: null,
    surgery: null,
    spayNeuter: null,
  };
  const ordered = [...scheduled].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.entryId.localeCompare(b.entryId),
  );
  for (const care of ordered) {
    const as = awaitedAs(care);
    if (!as || awaiting[as.group]) continue;
    awaiting[as.group] = {
      entryId: care.entryId,
      dueDate: care.dueDate,
      overdue: care.dueDate < today,
      label: as.label,
    };
  }
  return awaiting;
};

const LIVE: readonly MedicalConditionStatus[] = ["ACTIVE", "CHRONIC"];

const byName = <T extends { id: string; name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.id.localeCompare(b.id);

/** One animal's care status on `today`, from its rows. */
export const careStatus = (
  rows: {
    episode: OpenCareEpisode | null;
    surgeries: CompletedSurgery[];
    scheduled: ScheduledCare[];
    problems: ProblemListRow[];
  },
  today: CalendarDay,
): CareStatus => {
  const live = rows.problems.filter((row) => LIVE.includes(row.status)).sort(byName);
  return {
    episode: rows.episode,
    recovering: recoveringFrom(rows.surgeries, today),
    awaiting: awaitingCare(rows.scheduled, today),
    allergies: live
      .filter((row) => row.type === "ALLERGY")
      .map(({ id, name }) => ({ id, name })),
    conditions: live
      .filter((row) => row.type === "CONDITION")
      .map(({ id, name, status }) => ({ id, name, status })),
  };
};

/**
 * What the care is, in lower case: "hospitalised in house", "hospitalised at
 * Downtown Veterinary Clinic", "under vet care" or "under vet care at …".
 */
export const careEpisodeText = (
  type: CareEpisodeType,
  clinicName: string | null,
): string => {
  switch (type) {
    case "HOSPITALISED_IN_HOUSE":
      return "hospitalised in house";
    case "HOSPITALISED_OFF_SITE":
      return `hospitalised at ${clinicName ?? "a vet clinic"}`;
    case "UNDER_VET_CARE":
      return clinicName ? `under vet care at ${clinicName}` : "under vet care";
  }
};

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Hospitalised in house since Oct 3, 2026". */
export const openEpisodeText = (
  episode: Pick<OpenCareEpisode, "type" | "startDate" | "clinicName">,
): string =>
  `${capitalised(careEpisodeText(episode.type, episode.clinicName))} since ${formatShelterDay(episode.startDate)}`;

export interface CareStatusLine {
  key: string;
  text: string;
  /** Destructive for what a person handling the animal must not miss. */
  tone: "destructive" | "default";
}

/**
 * The banner's lines, in order: the open episode, recovering, what is
 * awaited (exam, surgery, spay or neuter), allergies. Nothing for a status
 * with none of them.
 */
export const careStatusLines = (status: CareStatus): CareStatusLine[] => {
  const lines: CareStatusLine[] = [];
  if (status.episode) {
    lines.push({
      key: "episode",
      text: openEpisodeText(status.episode),
      tone: "destructive",
    });
  }
  if (status.recovering) {
    const procedure = SURGERY_PROCEDURE_LABELS[status.recovering.procedure].toLowerCase();
    lines.push({
      key: "recovering",
      text: `Recovering from ${procedure} since ${formatShelterDay(status.recovering.surgeryDate)}`,
      tone: "default",
    });
  }
  for (const group of ["exam", "surgery", "spayNeuter"] as const) {
    const awaited = status.awaiting[group];
    if (!awaited) continue;
    const when = awaited.overdue
      ? `overdue since ${formatShelterDay(awaited.dueDate)}`
      : `due ${formatShelterDay(awaited.dueDate)}`;
    lines.push({
      key: `awaiting-${group}`,
      text: `Awaiting ${awaited.label}, ${when}`,
      tone: "default",
    });
  }
  if (status.allergies.length > 0) {
    const names = status.allergies.map((allergy) => allergy.name).join(", ");
    lines.push({
      key: "allergies",
      text: `${status.allergies.length === 1 ? "Allergy" : "Allergies"}: ${names}`,
      tone: "destructive",
    });
  }
  return lines;
};
