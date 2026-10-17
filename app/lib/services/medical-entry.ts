import { microchipRegistrationDayIssue, microchipRegistrationReplacementIssue } from "@/app/lib/utils/microchip-registration";
import { reportEntryData } from "./vet-visit-report-values";
import type { TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ExamType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  PartnerType,
  ReproductiveStatus,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import {
  calendarDay,
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  beforeIntakeIssue,
  dueDateIssue,
  futureDayIssue,
} from "@/app/lib/utils/medical-days";
import { stampedAfter } from "@/app/lib/utils/activity-stamp";
import { orderFindings } from "@/app/lib/utils/exam-findings";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import {
  recordVitals,
  vitalsMeasurementIssue,
  type VitalsMeasurementsInput,
} from "@/app/lib/services/vitals";
import { lockMedicalItemForUse } from "@/app/lib/services/medical-catalog";
import { findOpenScheduledItemIds } from "@/app/lib/data/animals/medical-entry";
import { findSpayNeuterEntries } from "@/app/lib/data/animals/medical-status";
import {
  procedureSexIssue,
  spayNeuterStatus,
} from "@/app/lib/utils/spay-neuter";
import {
  MEDICAL_REASON_MAX_LENGTH,
  ORDINARY_CARE_KINDS,
  SURGERY_PROCEDURE_LABELS,
  isCatalogEntryKind,
  type CatalogEntryKind,
} from "@/app/lib/constants/medical";
import {
  KIND_NOUN,
  MedicalEntryRefusal,
  catalogTerms,
  currentBodySystems,
  detailsCreate,
  entryData,
  examData,
  microchipData,
  surgeryData,
  testData,
  tidy,
  treatmentData,
  vaccineData,
  valuesFor,
  withStoredValues,
  type CatalogItem,
  type EntryField,
  type EntryValues,
  type MedicalEntryInput,
} from "@/app/lib/services/medical-entry-values";
import {
  batchText,
  dayText,
  describeChange,
  exemptionText,
  joinList,
  readNames,
  recordedSummary,
  subjectText,
  verbFor,
  type FoundOnExamText,
} from "@/app/lib/services/medical-entry-text";

export {
  MedicalEntryRefusal,
  type ExamEntryInput,
  type MedicalEntryInput,
  type MicrochipEntryInput,
  type SurgeryEntryInput,
  type TestEntryInput,
  type TreatmentEntryInput,
  type VaccineEntryInput,
} from "@/app/lib/services/medical-entry-values";

/**
 * Scheduling, recording, correcting and voiding a vaccine, test, treatment,
 * surgery or microchip for an animal. What each kind holds, and the rules
 * that need only the entry's own values, are in `medical-entry-values`; the
 * activity text each change writes is in `medical-entry-text`.
 *
 * Vaccines, tests and treatments are given from the catalog, and the steps
 * that read the item (its lock, whether it can be picked, its defaults) run
 * for them alone. A surgery has no item: its procedure says what it is, and a
 * spay or neuter must suit the animal's sex. A microchip has no item either:
 * its number says which chip it is, and no two entries that aren't voided
 * hold the same number. An exam has no item either: its type says which exam
 * it is, and an intake exam is dated in the stay it starts.
 *
 * Recording an exam can write two things beside it, in the same transaction:
 * the vitals measured during it, as a normal vitals entry through the vitals
 * service, and a spay or neuter it found already done, as a surgery before
 * intake whose evidence points back at the exam.
 *
 * Scheduled care is an entry with a due day and nothing else: no source, no
 * details row. Lot numbers and results are written only when it is given, so
 * they exist only for care that happened. Every read that derives a fact
 * counts only completed entries. Scheduled care is then recorded as given,
 * rescheduled to another day, or declined with a reason; a declined entry is
 * final. A spay or neuter that won't be done is an exemption: declined with a
 * reason from a list and maybe a day to review it, whether it was scheduled
 * first or recorded on its own.
 *
 * A correction edits the entry in place and writes an EDITED event holding the
 * before and after values of only what changed, plus a MEDICAL_ENTRY_EDITED
 * activity row naming each change and what it held before. An entry recorded
 * by mistake is voided rather than deleted: it stays on the record, with who
 * voided it, when and why, and counts for nothing. A void is written once and
 * never undone; a void made in error is answered by recording the entry again.
 * An entry's kind and animal never change: a wrong one is voided and recorded
 * again.
 *
 * Every write takes the animal's lock first, so two people changing the same
 * animal's entries at once are applied one after the other, each against what
 * the other wrote.
 *
 * Like `outcome-reversal`, this module has **no `next/*` and no auth imports**,
 * so the seed and a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`, and takes the shelter's today as an argument so tests
 * can pin it.
 */

/** Recording care can also schedule the next dose of a repeating item. */
export interface ScheduleNextInput {
  dueDate: CalendarDay;
}

/** Vitals measured during an exam, recorded with it. */
export interface ExamVitalsInput extends VitalsMeasurementsInput {
  /** When they were measured. */
  recordedAt: Date;
}

/**
 * A spay or neuter an exam found already done, recorded with the exam when
 * the exam reads the animal as altered and its record doesn't yet say so.
 */
export interface FoundAlteredInput {
  procedure: SurgeryProcedure;
}

/**
 * Care to record as given, and optionally the next dose to schedule. An exam
 * can also bring the vitals measured during it and the spay or neuter it
 * found; any other kind is refused them.
 */
export type RecordMedicalEntryInput = MedicalEntryInput & {
  scheduleNext?: ScheduleNextInput | null;
  vitals?: ExamVitalsInput | null;
  foundAltered?: FoundAlteredInput | null;
};

/** What recording wrote: the entry, and the next one when it was scheduled. */
export interface RecordedMedicalEntry {
  entryId: string;
  animalId: string;
  nextEntryId: string | null;
}

/**
 * Care to schedule: what, for whom, and the day it is due. Care from the
 * catalog names its item, a surgery its procedure and an exam its type. A
 * microchip needs none of these: its number is known once it is implanted.
 */
export type ScheduleMedicalEntryInput = {
  animalId: string;
  dueDate: CalendarDay;
  notes?: string | null;
} & CareKind;

/**
 * The batch an entry is written in, when one form wrote the same care for
 * several animals at once.
 */
export interface MedicalBatchTag {
  batchId: string;
  /** How many animals the batch covers, for the activity text. */
  size: number;
}

/** How an entry is written, beyond what it holds. */
export interface EntryWriteOptions {
  batch?: MedicalBatchTag | null;
  /** Given in foster care, or recorded from a foster's outside vet report. */
  reportedByFoster?: boolean;
  /** The waiting report this recorded care came from. */
  vetReportId?: string | null;
  /**
   * The medical protocol step that scheduled it, kept as provenance only:
   * the entry stands on its own. Applying a protocol writes one activity row
   * for all its entries, so an entry scheduled with a step writes none.
   */
  protocolStepId?: string | null;
}

/** How care recorded on its own is written, beyond what it holds. */
export interface RecordEntryOptions extends EntryWriteOptions {
  /**
   * Its activity row is stamped at least a millisecond after this instant.
   * The feed orders by time alone, and rows written back to back can share a
   * millisecond, so a caller that writes rows the feed must show first passes
   * the last one's stamp.
   */
  loggedAfter?: Date | null;
  /** The shelter's weight unit, for the text of an exam's vitals. */
  weightUnitSystem?: WeightUnitSystem;
}

/** How scheduled care recorded as given is written, beyond what it holds. */
export type RecordScheduledEntryOptions = Omit<RecordEntryOptions, "loggedAfter">;

export type MedicalEntryEdit =
  | { status: "edited"; entryId: string; animalId: string; changeSummary: string }
  | { status: "unchanged"; entryId: string; animalId: string };

// ---------------------------------------------------------------------------
// Stored values
// ---------------------------------------------------------------------------

// Prisma reads sibling relations of one row at the same time, which a
// transaction (one connection) can't do, so an entry and its details, and an
// item and its lists, are read one after the other.

type StoredEntry = {
  kind: MedicalEntryKind;
  dueDate: string | null;
  voidedAt: Date | null;
  /** The exam a surgery was found on, when it was. */
  foundOnExamId: string | null;
} & (
  | { status: typeof MedicalEntryStatus.COMPLETED; values: EntryValues }
  // Scheduled and declined care was never given, so it has no values to
  // compare and no details row.
  | {
      status:
        | typeof MedicalEntryStatus.SCHEDULED
        | typeof MedicalEntryStatus.DECLINED;
      values: null;
    }
);

/** Outcome ownership is enforced for direct service calls as well as forms. */
const requireOrdinaryCare = (entry: { kind: string; outcomeId?: unknown }) => {
  if (!ORDINARY_CARE_KINDS.some((kind) => kind === entry.kind) || entry.outcomeId != null) {
    throw new MedicalEntryRefusal(
      "Record and correct end-of-life medical details through the outcome. Only reversing the outcome can void its medical record.",
    );
  }
};

/**
 * The entry as stored, its given care flat behind its kind. Null when it
 * doesn't exist.
 */
const readStoredEntry = async (
  tx: TransactionClient,
  entryId: string,
): Promise<StoredEntry | null> => {
  const entry = await tx.medicalEntry.findUnique({
    where: { id: entryId },
    select: {
      kind: true,
      outcomeId: true,
      status: true,
      dueDate: true,
      itemId: true,
      procedure: true,
      chipNumber: true,
      examType: true,
      completedDate: true,
      source: true,
      vetPartnerId: true,
      vetName: true,
      administeredById: true,
      notes: true,
      voidedAt: true,
    },
  });
  if (!entry) return null;
  requireOrdinaryCare(entry);
  const {
    kind,
    status,
    dueDate,
    voidedAt,
    source,
    procedure,
    chipNumber,
    examType,
    outcomeId: _outcomeId,
    ...rest
  } = entry;
  if (status !== MedicalEntryStatus.COMPLETED) {
    return { kind, status, dueDate, voidedAt, foundOnExamId: null, values: null };
  }
  if (!source) {
    throw new Error(`Completed medical entry ${entryId} has no source.`);
  }
  const common = { ...rest, source };
  const stored = { kind, status, dueDate, voidedAt, foundOnExamId: null };

  switch (kind) {
    case MedicalEntryKind.EUTHANASIA:
    case MedicalEntryKind.DEATH:
      throw new Error("Outcome-owned entries do not have ordinary care values.");
    case MedicalEntryKind.VACCINE: {
      const vaccine = await tx.vaccineDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const values: EntryValues = {
        ...common,
        veterinarianName: vaccine.veterinarianName,
        veterinarianLicenseNumber: vaccine.veterinarianLicenseNumber,
        manufacturer: vaccine.manufacturer,
        lotNumber: vaccine.lotNumber,
        lotExpiryDate: vaccine.lotExpiryDate,
        route: vaccine.route,
        site: vaccine.site,
        rabiesTagNumber: vaccine.rabiesTagNumber,
        durationMonths: vaccine.durationMonths,
        validUntilDate: vaccine.validUntilDate,
      };
      return { ...stored, values };
    }
    case MedicalEntryKind.TEST: {
      const test = await tx.testDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const results = await tx.testAnalyteResult.findMany({
        where: { testDetailsId: test.id },
        orderBy: { analyte: { sortOrder: "asc" } },
        select: { analyteId: true, analyteName: true, result: true },
      });
      const values: EntryValues = {
        ...common,
        lotNumber: test.lotNumber,
        lotExpiryDate: test.lotExpiryDate,
        results,
      };
      return { ...stored, values };
    }
    case MedicalEntryKind.TREATMENT: {
      const treatment = await tx.treatmentDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const values: EntryValues = {
        ...common,
        doseAmount: treatment.doseAmount,
        doseUnit: treatment.doseUnit,
        route: treatment.route,
      };
      return { ...stored, values };
    }
    case MedicalEntryKind.SURGERY: {
      if (!procedure) {
        throw new Error(`Surgery entry ${entryId} has no procedure.`);
      }
      const surgery = await tx.surgeryDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const values: EntryValues = {
        ...common,
        procedure,
        surgeon: surgery.surgeon,
        findings: surgery.findings,
        anesthesiaNotes: surgery.anesthesiaNotes,
        evidence: surgery.evidence,
      };
      return { ...stored, foundOnExamId: surgery.foundOnExamId, values };
    }
    case MedicalEntryKind.MICROCHIP: {
      if (!chipNumber) {
        throw new Error(`Microchip entry ${entryId} has no chip number.`);
      }
      const microchip = await tx.microchipDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const values: EntryValues = {
        ...common,
        chipNumber,
        brand: microchip.brand,
        registrationStatus: microchip.registrationStatus,
        registryName: microchip.registryName,
        registrationDate: microchip.registrationDate,
        registrationNotes: microchip.registrationNotes,
      };
      return { ...stored, values };
    }
    case MedicalEntryKind.EXAM: {
      if (!examType) {
        throw new Error(`Exam entry ${entryId} has no exam type.`);
      }
      const exam = await tx.examDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const findings = await tx.examFinding.findMany({
        where: { examDetailsId: exam.id },
        select: { bodySystem: true, status: true, notes: true },
      });
      const values: EntryValues = {
        ...common,
        examType,
        overallResult: exam.overallResult,
        reproductiveStatus: exam.reproductiveStatus,
        examFindings: orderFindings(
          findings.map(({ bodySystem, status, notes }) => ({
            bodySystem,
            status,
            notes,
          })),
        ),
      };
      return { ...stored, values };
    }
  }
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

export interface AnimalFacts {
  speciesId: string;
  sex: Sex;
  birthDate: CalendarDay;
  /** Out of the shelter's care: its listing is archived. */
  archived: boolean;
  firstIntakeDate: CalendarDay | null;
  latestIntakeDate: CalendarDay | null;
}

/**
 * What the medical record's rules need to know about an animal: its species,
 * sex and birth day, whether it has left the shelter's care, and its first
 * and latest intake days. Read behind the animal's lock by every medical
 * write.
 */
export const readAnimal = async (
  tx: TransactionClient,
  animalId: string,
): Promise<AnimalFacts> => {
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: {
      speciesId: true,
      sex: true,
      birthDate: true,
      listingStatus: true,
      intake: { select: { intakeDate: true } },
    },
  });
  if (!animal) {
    throw new NotFoundError("Animal not found.");
  }
  const days = animal.intake.map((intake) => calendarDay(intake.intakeDate)).sort();
  return {
    speciesId: animal.speciesId,
    sex: animal.sex,
    birthDate: calendarDay(animal.birthDate),
    archived: animal.listingStatus === AnimalListingStatus.ARCHIVED,
    firstIntakeDate: days[0] ?? null,
    latestIntakeDate: days[days.length - 1] ?? null,
  };
};

const readItem = async (
  tx: TransactionClient,
  itemId: string,
): Promise<CatalogItem> => {
  const item = await tx.medicalItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      kind: true,
      name: true,
      manufacturer: true,
      defaultRoute: true,
      defaultDoseAmount: true,
      defaultDoseUnit: true,
      isRabies: true,
      repeatIntervalDays: true,
      retiredAt: true,
    },
  });
  if (!item) {
    throw new MedicalEntryRefusal("That catalog item no longer exists.", "itemId");
  }
  const species = await tx.species.findMany({
    where: { medicalItems: { some: { id: itemId } } },
    select: { id: true },
  });
  const analytes = await tx.medicalItemAnalyte.findMany({
    where: { itemId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, retiredAt: true },
  });
  // Item and entry kinds are separate enums that share their catalog values.
  // A medication isn't an entry kind, so its item never matches an entry's.
  return { ...item, kind: item.kind as MedicalEntryKind, species, analytes };
};

/** That the item can be picked for this animal and kind, as when recorded. */
const checkItemPickable = (
  item: CatalogItem,
  kind: MedicalEntryKind,
  animal: AnimalFacts,
) => {
  if (item.kind !== kind) {
    throw new MedicalEntryRefusal(
      `${item.name} is a ${item.kind.toLowerCase()}, not a ${KIND_NOUN[kind]}.`,
      "itemId",
    );
  }
  if (item.retiredAt) {
    throw new MedicalEntryRefusal(
      `${item.name} has been retired from the catalog and can't be used for new entries.`,
      "itemId",
    );
  }
  if (
    item.species.length > 0 &&
    !item.species.some((species) => species.id === animal.speciesId)
  ) {
    throw new MedicalEntryRefusal(
      `${item.name} isn't for this animal's species.`,
      "itemId",
    );
  }
};

/**
 * That a surgery names its procedure, and that a spay or neuter suits the
 * animal: a spay is for a female and a neuter for a male. An animal whose sex
 * isn't known can have either. Entries already stored aren't checked again
 * when the animal's sex changes.
 */
const checkProcedure = (
  procedure: SurgeryProcedure | null | undefined,
  animal: AnimalFacts,
) => {
  if (!procedure) {
    throw new MedicalEntryRefusal("Pick the procedure.", "procedure");
  }
  const issue = procedureSexIssue(procedure, animal.sex);
  if (issue) {
    throw new MedicalEntryRefusal(issue, "procedure");
  }
};

/**
 * What care is, by kind: its catalog item, its procedure, its exam type, or
 * none of these.
 */
export type CareKind =
  | { kind: CatalogEntryKind; itemId: string }
  | { kind: typeof MedicalEntryKind.SURGERY; procedure: SurgeryProcedure }
  | { kind: typeof MedicalEntryKind.MICROCHIP }
  | { kind: typeof MedicalEntryKind.EXAM; examType: ExamType };

/**
 * Checks what the care is against the animal, and returns its catalog item,
 * or null for care with none. A catalog item is locked until commit, so it
 * can't change kind or retire before the entry is written, and must be one
 * that can be picked for the animal. A surgery's procedure must suit the
 * animal's sex. An exam names its type. A microchip names none of these.
 *
 * With `stored` (what the entry already holds), the checks run only for what
 * changes: care already planned or given isn't refused because the catalog
 * or the animal's sex changed since.
 */
const checkCare = async (
  tx: TransactionClient,
  care: CareKind,
  animal: AnimalFacts,
  stored?: { itemId: string | null; procedure?: SurgeryProcedure | null },
): Promise<CatalogItem | null> => {
  switch (care.kind) {
    case MedicalEntryKind.SURGERY:
      if (!stored || care.procedure !== stored.procedure) {
        checkProcedure(care.procedure, animal);
      }
      return null;
    case MedicalEntryKind.MICROCHIP:
      return null;
    case MedicalEntryKind.EXAM:
      if (!care.examType) {
        throw new MedicalEntryRefusal("Pick the exam type.", "examType");
      }
      return null;
    default: {
      await lockMedicalItemForUse(tx, care.itemId);
      const item = await readItem(tx, care.itemId);
      if (!stored || care.itemId !== stored.itemId) {
        checkItemPickable(item, care.kind, animal);
      }
      return item;
    }
  }
};

/** What a scheduled entry stores about what is planned. */
const plannedData = (care: CareKind) => {
  switch (care.kind) {
    case MedicalEntryKind.SURGERY:
      return { procedure: care.procedure };
    case MedicalEntryKind.MICROCHIP:
      return {};
    case MedicalEntryKind.EXAM:
      return { examType: care.examType };
    default:
      return { itemId: care.itemId };
  }
};

const checkDay = (
  kind: MedicalEntryKind,
  completedDate: CalendarDay | null,
  source: MedicalEntrySource,
  animal: AnimalFacts,
  today: CalendarDay,
) => {
  if (completedDate === null) {
    if (source !== MedicalEntrySource.BEFORE_INTAKE) {
      throw new MedicalEntryRefusal(
        "The date given is required. Only care given before intake can have an unknown date.",
        "completedDate",
      );
    }
    return;
  }
  const future = futureDayIssue(completedDate, today, "The date given");
  if (future) {
    throw new MedicalEntryRefusal(future, "completedDate");
  }
  const beforeIntake =
    source !== MedicalEntrySource.BEFORE_INTAKE &&
    beforeIntakeIssue(completedDate, animal.firstIntakeDate, "The date given");
  if (beforeIntake) {
    // An exam can't be recorded as before intake, so it isn't pointed there.
    throw new MedicalEntryRefusal(
      `${beforeIntake}${
        kind === MedicalEntryKind.EXAM
          ? ""
          : " Care given before the animal arrived is recorded as before intake."
      }`,
      "completedDate",
    );
  }
  if (
    source === MedicalEntrySource.BEFORE_INTAKE &&
    animal.latestIntakeDate &&
    completedDate > animal.latestIntakeDate
  ) {
    throw new MedicalEntryRefusal(
      `Care given before intake can't be dated after the animal's intake on ${formatShelterDay(animal.latestIntakeDate)}.`,
      "completedDate",
    );
  }
};

/**
 * An intake exam starts the stay it is dated in, so it is dated on or after
 * the animal's latest intake. A returned animal is examined again. Other
 * exams follow the day rules every care follows.
 */
const checkExamDay = (
  examType: ExamType,
  completedDate: CalendarDay | null,
  animal: AnimalFacts,
) => {
  if (
    examType === ExamType.INTAKE &&
    completedDate !== null &&
    animal.latestIntakeDate &&
    completedDate < animal.latestIntakeDate
  ) {
    throw new MedicalEntryRefusal(
      `An intake exam is dated on or after the animal's latest intake, on ${formatShelterDay(animal.latestIntakeDate)}.`,
      "completedDate",
    );
  }
};

/**
 * Refuses a due day the scheduling rules don't allow: before today, or too
 * far ahead. `field` is the form field the day was typed in, and `label`
 * names the day in the message when it isn't a due day.
 */
export const checkDueDate = (
  dueDate: CalendarDay,
  today: CalendarDay,
  field = "dueDate",
  label?: string,
) => {
  const issue = dueDateIssue(dueDate, today, label);
  if (issue) {
    throw new MedicalEntryRefusal(issue, field);
  }
};

// The refusal for a chip number another live entry holds, naming the animal
// that has it.
const chipNumberTaken = (holder: { animalId: string; animalName: string }, animalId: string | null) =>
  new MedicalEntryRefusal(
    holder.animalId === animalId
      ? "That chip number is already on this animal's record."
      : `That chip number is already on ${holder.animalName}'s record.`,
    "chipNumber",
  );

// Who holds a chip number on an entry that isn't voided, other than
// `exceptEntryId`. Null when nobody does.
const findChipNumberHolder = async (
  db: Pick<TransactionClient, "medicalEntry">,
  chipNumber: string,
  exceptEntryId: string | null,
) => {
  const holder = await db.medicalEntry.findFirst({
    where: {
      chipNumber,
      voidedAt: null,
      ...(exceptEntryId && { id: { not: exceptEntryId } }),
    },
    select: { animalId: true, animal: { select: { name: true } } },
  });
  return holder ? { animalId: holder.animalId, animalName: holder.animal.name } : null;
};

/**
 * Refuses a chip number another entry that isn't voided already holds. A
 * voided entry's number is free again. Read behind the animal's lock, so two
 * people recording one number for one animal are refused in turn; two
 * animals recording it at once are refused by the database's unique index
 * instead (see `writingChipNumber`).
 */
const checkChipNumberFree = async (
  tx: TransactionClient,
  chipNumber: string | undefined,
  animalId: string,
  entryId: string | null,
) => {
  if (!chipNumber) return;
  const holder = await findChipNumberHolder(tx, chipNumber, entryId);
  if (holder) {
    throw chipNumberTaken(holder, animalId);
  }
};

/**
 * A chip number the database's unique index refused: another animal's entry
 * took it at the same moment, in a transaction this write's own check
 * couldn't see. A refusal on the chip number field whatever happens to that
 * entry afterwards; `nameChipNumberHolder` names the animal when it can.
 */
export class ChipNumberClash extends MedicalEntryRefusal {
  readonly chipNumber: string;

  constructor(chipNumber: string) {
    super(
      "That chip number was just recorded for another animal. Check the number and save again.",
      "chipNumber",
    );
    this.name = "ChipNumberClash";
    this.chipNumber = chipNumber;
  }
}

/**
 * Runs the statement that writes `chipNumber`, turning the unique index's
 * refusal into a `ChipNumberClash`. The check behind the animal's lock reads
 * only what is committed, so when two animals are given one number at once,
 * neither sees the other, and the index refuses the second write when the
 * first commits. Nothing else the statement writes can collide (the entry's
 * and its details' keys are new), so a P2002 here is the chip index; Prisma
 * doesn't reliably name the index through the pg adapter.
 */
const writingChipNumber = async <T>(
  chipNumber: string | null | undefined,
  write: () => Promise<T>,
): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    if (
      chipNumber &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ChipNumberClash(chipNumber);
    }
    throw error;
  }
};

/**
 * For a `ChipNumberClash`, once its transaction has rolled back: the refusal
 * naming the animal that now holds the number, as the service's own check
 * would, or the clash as it is when nobody holds the number any more (that
 * entry was voided or corrected in the meantime). Any other error is
 * returned unchanged.
 *
 * Naming is a nicety. When the lookup itself fails, it is logged and the
 * clash returned, so the refusal still reaches the chip number field.
 */
export const nameChipNumberHolder = async (
  db: Pick<TransactionClient, "medicalEntry">,
  error: unknown,
): Promise<unknown> => {
  if (!(error instanceof ChipNumberClash)) return error;
  try {
    const holder = await findChipNumberHolder(db, error.chipNumber, null);
    return holder ? chipNumberTaken(holder, null) : error;
  } catch (lookupError) {
    console.error("Error finding who holds a clashed chip number:", lookupError);
    return error;
  }
};

const checkVet = async (
  tx: TransactionClient,
  source: MedicalEntrySource,
  vetPartnerId: string | null,
  vetName: string | null,
  partnerChanged: boolean,
) => {
  if (source === MedicalEntrySource.IN_HOUSE) {
    if (vetPartnerId) {
      throw new MedicalEntryRefusal(
        "A vet clinic is only for care given outside the shelter.",
        "vetPartnerId",
      );
    }
    if (vetName) {
      throw new MedicalEntryRefusal(
        "A vet's name is only for care given outside the shelter.",
        "vetName",
      );
    }
    return;
  }
  if (!vetPartnerId || !partnerChanged) return;
  await checkVetClinic(tx, vetPartnerId, "vetPartnerId");
};

/**
 * Refuses a partner that isn't an active vet clinic, on `field`. Run only
 * when the clinic is picked or changed, so care keeps a clinic made inactive
 * after it was given.
 */
export const checkVetClinic = async (
  tx: TransactionClient,
  partnerId: string,
  field: string,
) => {
  const partner = await tx.partner.findUnique({
    where: { id: partnerId },
    select: { type: true, isActive: true },
  });
  if (!partner || partner.type !== PartnerType.VET_CLINIC || !partner.isActive) {
    throw new MedicalEntryRefusal(
      "Pick a vet clinic from the partner directory.",
      field,
    );
  }
};

const asJson = (value: object) => value as Prisma.InputJsonObject;

// What a batch adds to an entry and to the event that writes it.
const batchData = (batch: MedicalBatchTag | null | undefined) =>
  batch ? { batchId: batch.batchId } : {};

// What a protocol step adds to an entry and to the event that writes it.
const protocolStepData = (protocolStepId: string | null | undefined) =>
  protocolStepId ? { protocolStepId } : {};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Schedules care for a due day. The entry holds the item (or, for a surgery,
 * the procedure), the day and any notes, and nothing about how it will be
 * given: that is written when it is recorded as given.
 *
 * Only an animal in the shelter's care can have care scheduled. Recording,
 * declining and voiding what is already scheduled work after it leaves, so
 * its open entries can still be cleared.
 *
 * Care a protocol schedules names its step, and its activity row is the
 * protocol's, written once by the caller for every entry.
 */
export async function scheduleMedicalEntry(
  tx: TransactionClient,
  input: ScheduleMedicalEntryInput,
  actorId: string,
  today: CalendarDay,
  { batch, protocolStepId }: EntryWriteOptions = {},
): Promise<{ entryId: string; animalId: string }> {
  requireOrdinaryCare(input);
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so nothing can be scheduled for it.",
    );
  }
  const item = await checkCare(tx, input, animal);
  checkDueDate(input.dueDate, today);

  // What is planned: the item, the surgery's procedure, or a microchip.
  const planned = plannedData(input);
  const notes = tidy(input.notes);
  const entry = await tx.medicalEntry.create({
    data: {
      animalId,
      kind: input.kind,
      ...planned,
      status: MedicalEntryStatus.SCHEDULED,
      dueDate: input.dueDate,
      notes,
      ...batchData(batch),
      ...protocolStepData(protocolStepId),
      createdById: actorId,
    },
    select: { id: true },
  });

  await tx.medicalEntryEvent.create({
    data: {
      entryId: entry.id,
      action: MedicalEntryEventAction.CREATED,
      actorId,
      after: asJson({
        kind: input.kind,
        status: MedicalEntryStatus.SCHEDULED,
        ...planned,
        dueDate: input.dueDate,
        notes,
        ...batchData(batch),
        ...protocolStepData(protocolStepId),
      }),
    },
  });

  if (protocolStepId) return { entryId: entry.id, animalId };

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
      changedById: actorId,
      changeSummary: `${subjectText({ kind: input.kind, item, ...planned })} scheduled for ${dayText(input.dueDate)}.${batchText(batch)}`,
    },
  });

  return { entryId: entry.id, animalId };
}

/**
 * Takes the entry's animal lock, then reads the entry as it is now, refusing
 * it unless it is scheduled and not voided. `doing` completes "so it can't
 * be …" in the refusal. Read behind the lock, so of two people acting on one
 * scheduled entry at once, the second sees what the first did.
 */
const lockScheduledEntry = async (
  tx: TransactionClient,
  entryId: string,
  doing: string,
) => {
  // An entry's animal never changes, so it can be read before the lock.
  const located = await tx.medicalEntry.findUnique({
    where: { id: entryId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Medical entry not found.");
  }
  const { animalId } = located;
  await lockAnimal(tx, animalId);

  const entry = await tx.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      kind: true,
      outcomeId: true,
      status: true,
      itemId: true,
      procedure: true,
      examType: true,
      dueDate: true,
      voidedAt: true,
      item: { select: { name: true } },
    },
  });
  requireOrdinaryCare(entry);
  if (entry.voidedAt) {
    throw new ConflictError(`This entry was voided, so it can't be ${doing}.`);
  }
  if (entry.status !== MedicalEntryStatus.SCHEDULED) {
    throw new ConflictError(
      entry.status === MedicalEntryStatus.COMPLETED
        ? `This entry has already been recorded as given, so it can't be ${doing}.`
        : `This entry was declined, so it can't be ${doing}.`,
    );
  }
  if (!entry.dueDate) {
    throw new Error(`Scheduled medical entry ${entryId} has no due date.`);
  }
  return {
    animalId,
    kind: entry.kind,
    itemId: entry.itemId,
    procedure: entry.procedure,
    subject: subjectText(entry),
    dueDate: calendarDay(entry.dueDate),
  };
};

/**
 * Moves scheduled care to another due day, under the same rules as
 * scheduling it. The new day must differ from the current one.
 */
export async function rescheduleMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  dueDate: CalendarDay,
  actorId: string,
  today: CalendarDay,
): Promise<{ entryId: string; animalId: string }> {
  const entry = await lockScheduledEntry(tx, entryId, "rescheduled");
  if (dueDate === entry.dueDate) {
    throw new MedicalEntryRefusal(
      "That is already its due date. Pick another day.",
      "dueDate",
    );
  }
  checkDueDate(dueDate, today);

  await tx.medicalEntry.update({ where: { id: entryId }, data: { dueDate } });
  await tx.medicalEntryEvent.create({
    data: {
      entryId,
      action: MedicalEntryEventAction.RESCHEDULED,
      actorId,
      before: { dueDate: entry.dueDate },
      after: { dueDate },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId: entry.animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_RESCHEDULED,
      changedById: actorId,
      changeSummary: `${entry.subject} rescheduled from ${dayText(entry.dueDate)} to ${dayText(dueDate)}.`,
    },
  });

  return { entryId, animalId: entry.animalId };
}

/** An exemption from a spay or neuter: why, and when to look at it again. */
export interface SpayNeuterExemptionTerms {
  exemptionReason: SpayNeuterExemptionReason;
  /** Left out or null, the exemption holds until it is voided. */
  reviewDate?: CalendarDay | null;
}

/** Declining a scheduled spay or neuter, which records an exemption. */
export interface DeclineAsExemption extends SpayNeuterExemptionTerms {
  /** The shelter's today, which the review day can't be before. */
  today: CalendarDay;
}

const isSpayOrNeuter = (procedure: SurgeryProcedure | null | undefined) =>
  procedure === SurgeryProcedure.SPAY || procedure === SurgeryProcedure.NEUTER;

/**
 * The values an exemption stores, after its rules: a reason from the list,
 * a note in words that is required only when the reason is Other, and a
 * review day that follows the scheduling rules, if there is one. `noteField`
 * is the form field the note was typed in.
 */
const exemptionValues = (
  terms: Partial<SpayNeuterExemptionTerms>,
  note: string | null | undefined,
  today: CalendarDay,
  noteField: string,
) => {
  if (!terms.exemptionReason) {
    throw new MedicalEntryRefusal(
      "Pick the reason for the exemption.",
      "exemptionReason",
    );
  }
  const declineReason = tidy(note);
  if (terms.exemptionReason === SpayNeuterExemptionReason.OTHER && !declineReason) {
    throw new MedicalEntryRefusal("Say why the animal is exempt.", noteField);
  }
  if (declineReason && declineReason.length > MEDICAL_REASON_MAX_LENGTH) {
    throw new MedicalEntryRefusal(
      `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`,
      noteField,
    );
  }
  const reviewDate = terms.reviewDate ?? null;
  if (reviewDate) {
    checkDueDate(reviewDate, today, "reviewDate", "The review date");
  }
  return { exemptionReason: terms.exemptionReason, declineReason, reviewDate };
};

/**
 * Refuses an exemption for an animal already spayed or neutered on its
 * record: the status would read Altered whatever the exemption said. Call it
 * behind the animal's lock. `instead` says what to do, if anything.
 */
const refuseExemptionWhenAltered = async (
  tx: TransactionClient,
  animalId: string,
  today: CalendarDay,
  instead = "",
) => {
  const entries = (await findSpayNeuterEntries(tx, [animalId])).get(animalId) ?? [];
  if (spayNeuterStatus(entries, today).status === "ALTERED") {
    throw new MedicalEntryRefusal(
      `This animal is already spayed or neutered on its record, so it can't be exempt.${instead}`,
    );
  }
};

/**
 * Declines scheduled care, with the reason it won't be given. The entry stays
 * on the record as declined, and is final: one declined in error is voided
 * and scheduled again.
 *
 * Declining a spay or neuter records an exemption, so the animal's status
 * says why it isn't altered: `exemption` is required then, with its reason
 * and maybe a review day, and the reason in words is needed only for Other.
 * It is refused for an animal already spayed or neutered on its record,
 * whose leftover appointment is voided instead.
 * Any other care can't be declined as an exemption, and needs `reason`.
 */
export async function declineMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  reason: string | null | undefined,
  actorId: string,
  exemption?: DeclineAsExemption | null,
): Promise<{ entryId: string; animalId: string }> {
  const entry = await lockScheduledEntry(tx, entryId, "declined");

  let declined: {
    declineReason: string | null;
    exemptionReason?: SpayNeuterExemptionReason;
    reviewDate?: CalendarDay | null;
  };
  let summary: string;
  if (isSpayOrNeuter(entry.procedure)) {
    if (!exemption) {
      throw new MedicalEntryRefusal(
        "Declining a spay or neuter records an exemption. Pick its reason.",
        "exemptionReason",
      );
    }
    const values = exemptionValues(exemption, reason, exemption.today, "reason");
    await refuseExemptionWhenAltered(
      tx,
      entry.animalId,
      exemption.today,
      ` Void this scheduled ${SURGERY_PROCEDURE_LABELS[entry.procedure!].toLowerCase()} instead.`,
    );
    declined = values;
    summary = `${entry.subject} due ${dayText(entry.dueDate)} was declined as an exemption: ${exemptionText(values)}`;
  } else {
    if (exemption) {
      throw new MedicalEntryRefusal(
        "Only a spay or neuter can be declined as an exemption.",
        "exemptionReason",
      );
    }
    const declineReason = tidy(reason);
    if (!declineReason) {
      throw new MedicalEntryRefusal(
        "A reason for declining this entry is required.",
        "reason",
      );
    }
    if (declineReason.length > MEDICAL_REASON_MAX_LENGTH) {
      throw new MedicalEntryRefusal(
        `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`,
        "reason",
      );
    }
    declined = { declineReason };
    summary = `${entry.subject} due ${dayText(entry.dueDate)} was declined. Reason: ${declineReason}`;
  }

  await tx.medicalEntry.update({
    where: { id: entryId },
    data: { status: MedicalEntryStatus.DECLINED, ...declined },
  });
  await tx.medicalEntryEvent.create({
    data: {
      entryId,
      action: MedicalEntryEventAction.DECLINED,
      actorId,
      before: { status: MedicalEntryStatus.SCHEDULED },
      after: asJson({ status: MedicalEntryStatus.DECLINED, ...declined }),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId: entry.animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_DECLINED,
      changedById: actorId,
      changeSummary: summary,
    },
  });

  return { entryId, animalId: entry.animalId };
}

/** An exemption recorded on its own, with no spay or neuter scheduled first. */
export interface RecordSpayNeuterExemptionInput extends SpayNeuterExemptionTerms {
  animalId: string;
  procedure: SurgeryProcedure;
  /** Why, in words: required when the reason is Other. */
  declineReason?: string | null;
}

/**
 * Records that an animal is exempt from a spay or neuter, without one being
 * scheduled first: a declined surgery entry with its procedure, its reason
 * and maybe a review day, and no due day. The procedure must suit the
 * animal's sex. Refused for an animal that has left the shelter's care, as
 * scheduling is, and for one already spayed or neutered on its record.
 *
 * Like any decline, it is final. An exemption is extended by recording a new
 * one, and ended by scheduling or recording the spay or neuter.
 */
export async function recordSpayNeuterExemption(
  tx: TransactionClient,
  input: RecordSpayNeuterExemptionInput,
  actorId: string,
  today: CalendarDay,
): Promise<{ entryId: string; animalId: string }> {
  const { animalId, procedure } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so no exemption can be recorded for it.",
    );
  }
  if (!isSpayOrNeuter(procedure)) {
    throw new MedicalEntryRefusal(
      "An exemption is from a spay or a neuter.",
      "procedure",
    );
  }
  checkProcedure(procedure, animal);
  const values = exemptionValues(input, input.declineReason, today, "declineReason");

  await refuseExemptionWhenAltered(tx, animalId, today);

  const entry = await tx.medicalEntry.create({
    data: {
      animalId,
      kind: MedicalEntryKind.SURGERY,
      procedure,
      status: MedicalEntryStatus.DECLINED,
      ...values,
      createdById: actorId,
    },
    select: { id: true },
  });
  await tx.medicalEntryEvent.create({
    data: {
      entryId: entry.id,
      action: MedicalEntryEventAction.CREATED,
      actorId,
      after: asJson({
        kind: MedicalEntryKind.SURGERY,
        status: MedicalEntryStatus.DECLINED,
        procedure,
        ...values,
      }),
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_DECLINED,
      changedById: actorId,
      changeSummary: `${SURGERY_PROCEDURE_LABELS[procedure]} exemption recorded: ${exemptionText(values)}`,
    },
  });

  return { entryId: entry.id, animalId };
}

// ---------------------------------------------------------------------------
// Recording care as given
// ---------------------------------------------------------------------------
//
// Recording ad hoc and recording care that was scheduled share these, so the
// two can't drift: the same day, vet and per-kind rules, the same values, the
// same details rows and the same activity text.

/**
 * The values care given stores, after the day, vet and per-kind rules. Blank
 * defaults (manufacturer, route, dose) are filled in from the catalog item,
 * since this is the first time the entry's details are written: changing the
 * item's defaults later never rewrites it. Care with no item (a surgery)
 * takes `null`.
 */
const givenValues = async (
  tx: TransactionClient,
  input: MedicalEntryInput,
  item: CatalogItem | null,
  animal: AnimalFacts,
  actorId: string,
  today: CalendarDay,
  foundOnExam = false,
): Promise<EntryValues> => {
  checkDay(input.kind, input.completedDate, input.source, animal, today);
  if (input.kind === MedicalEntryKind.EXAM) {
    checkExamDay(input.examType, input.completedDate, animal);
  }

  const vetPartnerId = input.vetPartnerId || null;
  const vetName = tidy(input.vetName);
  await checkVet(tx, input.source, vetPartnerId, vetName, true);

  const administeredById =
    input.administeredById !== undefined
      ? input.administeredById
      : input.source === MedicalEntrySource.IN_HOUSE
        ? actorId
        : null;

  const values = valuesFor(
    input,
    item,
    {
      completedDate: input.completedDate,
      source: input.source,
      vetPartnerId,
      vetName,
      administeredById,
      notes: tidy(input.notes),
    },
    {
      itemDefaults: true,
      ...catalogTerms(item),
      bodySystems: currentBodySystems(),
      foundOnExam,
    },
  );
  checkRegistrationDay(values, animal, today);
  return values;
};

const checkRegistrationDay = (values: EntryValues, animal: AnimalFacts, today: CalendarDay) => {
  if (values.registrationStatus === undefined) return;
  const issue = microchipRegistrationDayIssue(
    values.registrationDate ? calendarDay(values.registrationDate) : null,
    {
      today, birthDate: animal.birthDate,
      // Before-intake care records a scan, never a known implantation day.
      implantationDate: values.source === MedicalEntrySource.BEFORE_INTAKE || !values.completedDate
        ? null : calendarDay(values.completedDate),
    },
  );
  if (issue) throw new MedicalEntryRefusal(issue.message, issue.field);
};

/**
 * Schedules the next dose of `item` after care given on `completedDate`, when
 * asked to. The day is the caller's: the form suggests one (`nextDueDate`),
 * and the scheduling rules apply to whatever is sent. Refused when the item
 * doesn't repeat, the day given is unknown, the item is retired, or the
 * animal already has the item scheduled, since then the next one is already
 * planned. Returns the new entry's id.
 */
const scheduleNextDose = async (
  tx: TransactionClient,
  animalId: string,
  kind: MedicalEntryKind,
  item: CatalogItem | null,
  completedDate: string | null,
  next: ScheduleNextInput | null | undefined,
  actorId: string,
  today: CalendarDay,
  options: EntryWriteOptions,
): Promise<string | null> => {
  if (!next) return null;
  if (!item || !isCatalogEntryKind(kind)) {
    throw new MedicalEntryRefusal("Only a catalog item can repeat.", "scheduleNext");
  }
  if (item.repeatIntervalDays === null) {
    throw new MedicalEntryRefusal(
      `${item.name} doesn't repeat, so there is no next one to schedule.`,
      "scheduleNext",
    );
  }
  if (completedDate === null) {
    throw new MedicalEntryRefusal(
      "The next one can't be scheduled from an unknown date.",
      "scheduleNext",
    );
  }
  if (item.retiredAt) {
    throw new MedicalEntryRefusal(
      `${item.name} has been retired from the catalog, so the next one can't be scheduled.`,
      "scheduleNext",
    );
  }
  // Read after the care just recorded left the scheduled list, so recording
  // a scheduled dose doesn't count as the next one being planned.
  if ((await findOpenScheduledItemIds(tx, animalId)).has(item.id)) {
    throw new MedicalEntryRefusal(
      `${item.name} is already scheduled for this animal.`,
      "scheduleNext",
    );
  }
  checkDueDate(next.dueDate, today, "scheduleNext.dueDate");

  const { entryId } = await scheduleMedicalEntry(
    tx,
    { animalId, kind, itemId: item.id, dueDate: next.dueDate },
    actorId,
    today,
    options,
  );
  return entryId;
};

/**
 * Refuses what only an exam brings with it, for any other kind, and checks
 * an exam's extras before anything is written: its vitals against the
 * measurement rules, and the spay or neuter it found. That one is recorded
 * only when the exam reads the animal as altered, the animal isn't altered
 * on its record already, and the procedure suits its sex. Call it behind the
 * animal's lock.
 */
const checkRecordExtras = async (
  tx: TransactionClient,
  input: RecordMedicalEntryInput,
  animalId: string,
  animal: AnimalFacts,
  today: CalendarDay,
) => {
  if (input.kind !== MedicalEntryKind.EXAM) {
    if (input.vitals) {
      throw new MedicalEntryRefusal(
        "Only an exam records vitals with it. Record them on the Vitals page.",
        "vitals",
      );
    }
    if (input.foundAltered) {
      throw new MedicalEntryRefusal(
        "Only an exam can find a spay or neuter already done.",
        "foundAltered",
      );
    }
    return;
  }
  if (input.vitals) {
    const issue = vitalsMeasurementIssue(input.vitals);
    if (issue) {
      throw new MedicalEntryRefusal(issue.message, `vitals.${issue.field}`);
    }
  }
  if (input.foundAltered) {
    if (input.reproductiveStatus !== ReproductiveStatus.ALTERED) {
      throw new MedicalEntryRefusal(
        "A spay or neuter is recorded with an exam only when the exam found the animal altered.",
        "foundAltered",
      );
    }
    const { procedure } = input.foundAltered;
    if (!isSpayOrNeuter(procedure)) {
      throw new MedicalEntryRefusal("Pick spay or neuter.", "foundAltered.procedure");
    }
    const sexIssue = procedureSexIssue(procedure, animal.sex);
    if (sexIssue) {
      throw new MedicalEntryRefusal(sexIssue, "foundAltered.procedure");
    }
    const entries = (await findSpayNeuterEntries(tx, [animalId])).get(animalId) ?? [];
    if (spayNeuterStatus(entries, today).status === "ALTERED") {
      throw new MedicalEntryRefusal(
        "This animal is already spayed or neutered on its record.",
        "foundAltered",
      );
    }
  }
};

/**
 * Writes the vitals an exam measured as a normal vitals entry, its activity
 * row stamped after the exam's, and links it from the exam's details. The
 * entry is then the Vitals page's to edit or delete; correcting the exam
 * never touches it. Returns its id, and the last activity row's stamp.
 */
const writeExamVitals = async (
  tx: TransactionClient,
  exam: { entryId: string; animalId: string },
  vitals: ExamVitalsInput | null | undefined,
  actorId: string,
  loggedAfter: Date,
  unitSystem: WeightUnitSystem | undefined,
): Promise<{ vitalsLogId: string | null; loggedAt: Date }> => {
  if (!vitals) return { vitalsLogId: null, loggedAt: loggedAfter };
  if (!unitSystem) {
    throw new Error("Recording an exam's vitals needs the shelter's weight unit.");
  }
  const { vitalsLogId, loggedAt } = await recordVitals(
    tx,
    { ...vitals, animalId: exam.animalId },
    actorId,
    { unitSystem, loggedAfter },
  );
  await tx.examDetails.update({
    where: { entryId: exam.entryId },
    data: { vitalsLogId },
  });
  return { vitalsLogId, loggedAt };
};

/** The exam a spay or neuter was found on, which its surgery links to. */
interface FoundOnExam extends FoundOnExamText {
  entryId: string;
}

/**
 * Records the spay or neuter an exam found, after the exam and its vitals:
 * done before intake, on a day nobody knows, its evidence the exam it links
 * to. Checked already by `checkRecordExtras`; anything the surgery's own
 * rules still refuse comes back under `foundAltered`. Returns the last
 * activity row's stamp.
 */
const writeFoundAltered = async (
  tx: TransactionClient,
  animalId: string,
  exam: FoundOnExam,
  foundAltered: FoundAlteredInput | null | undefined,
  actorId: string,
  today: CalendarDay,
  loggedAfter: Date,
): Promise<Date> => {
  if (!foundAltered) return loggedAfter;
  try {
    const { loggedAt } = await writeRecordedEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.SURGERY,
        procedure: foundAltered.procedure,
        completedDate: null,
        source: MedicalEntrySource.BEFORE_INTAKE,
        evidence: SurgeryEvidence.FOUND_ON_EXAM,
      },
      actorId,
      today,
      { loggedAfter },
      exam,
    );
    return loggedAt;
  } catch (error) {
    if (error instanceof MedicalEntryRefusal) {
      throw new MedicalEntryRefusal(
        error.message,
        error.field ? `foundAltered.${error.field}` : "foundAltered",
      );
    }
    throw error;
  }
};

/**
 * Records care as given, with nothing scheduled before it. With
 * `scheduleNext`, the next dose of a repeating catalog item is scheduled in
 * the same transaction. An exam's vitals, then the spay or neuter it found,
 * are written after it. Also returns when its last activity row was stamped.
 */
export async function recordMedicalEntry(
  tx: TransactionClient,
  input: RecordMedicalEntryInput & { animalId: string },
  actorId: string,
  today: CalendarDay,
  options: RecordEntryOptions = {},
): Promise<RecordedMedicalEntry & { loggedAt: Date }> {
  return writeRecordedEntry(tx, input, actorId, today, options, null);
}

/**
 * `recordMedicalEntry`, and, with `foundOn`, the surgery an exam found:
 * only then is found on an exam allowed as its evidence, and the surgery
 * links to that exam.
 */
async function writeRecordedEntry(
  tx: TransactionClient,
  input: RecordMedicalEntryInput & { animalId: string },
  actorId: string,
  today: CalendarDay,
  options: RecordEntryOptions,
  foundOn: FoundOnExam | null,
): Promise<RecordedMedicalEntry & { loggedAt: Date }> {
  requireOrdinaryCare(input);
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const provenance = await reportEntryData(tx, animalId, input.source, options.vetReportId);
  const animal = await readAnimal(tx, animalId);
  const item = await checkCare(tx, input, animal);
  const values = await givenValues(
    tx,
    input,
    item,
    animal,
    actorId,
    today,
    foundOn !== null,
  );
  await checkRecordExtras(tx, input, animalId, animal, today);
  await checkChipNumberFree(tx, values.chipNumber, animalId, null);

  const entry = await writingChipNumber(values.chipNumber, () =>
    tx.medicalEntry.create({
      data: {
        animalId,
        kind: input.kind,
        status: MedicalEntryStatus.COMPLETED,
        createdById: actorId,
        ...entryData(values),
        reportedByFoster: options.reportedByFoster ?? false,
        ...provenance,
        ...batchData(options.batch),
        ...detailsCreate(input.kind, values, foundOn?.entryId),
      },
      select: { id: true },
    }),
  );

  const changeSummary = await recordedSummary(
    tx,
    item,
    input.kind,
    values,
    null,
    options.batch,
    foundOn,
  );
  const { changedAt: entryLoggedAt } = await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: actorId,
      changeSummary,
      changedAt: stampedAfter(options.loggedAfter),
    },
    select: { changedAt: true },
  });

  const { vitalsLogId, loggedAt: vitalsLoggedAt } = await writeExamVitals(
    tx,
    { entryId: entry.id, animalId },
    input.vitals,
    actorId,
    entryLoggedAt,
    options.weightUnitSystem,
  );

  await tx.medicalEntryEvent.create({
    data: {
      entryId: entry.id,
      action: MedicalEntryEventAction.CREATED,
      actorId,
      after: asJson({
        kind: input.kind,
        status: MedicalEntryStatus.COMPLETED,
        ...values,
        ...(options.reportedByFoster && { reportedByFoster: true }),
        ...provenance,
        ...batchData(options.batch),
        ...(vitalsLogId && { vitalsLogId }),
        ...(foundOn && { foundOnExamId: foundOn.entryId }),
      }),
    },
  });

  const loggedAt = await writeFoundAltered(
    tx,
    animalId,
    {
      entryId: entry.id,
      examType: values.examType!,
      completedDate: values.completedDate,
    },
    input.foundAltered,
    actorId,
    today,
    vitalsLoggedAt,
  );

  const nextEntryId = await scheduleNextDose(
    tx,
    animalId,
    input.kind,
    item,
    values.completedDate,
    input.scheduleNext,
    actorId,
    today,
    options,
  );
  return { entryId: entry.id, animalId, nextEntryId, loggedAt };
}

/**
 * Records scheduled care as given. The entry keeps its due day and gains what
 * was given; its details are written now, for the first time.
 *
 * The item can change within the kind (the dose given was another product
 * than the one planned), and the catalog checks run only if it does: an item
 * retired after the care was scheduled can still be recorded, since the
 * entry isn't new. A surgery's procedure can change the same way (a planned
 * spay recorded as the neuter it was), and the sex rule runs only if it
 * does. Care scheduled during the stay was given in house or by an
 * outside vet, never before intake. It may be dated before its due day, if it
 * was given early.
 *
 * Works for an animal that has left the shelter's care, so its open entries
 * can still be cleared. With `scheduleNext`, the next dose is scheduled in
 * the same transaction. An exam's vitals, then the spay or neuter it found,
 * are written after it.
 */
export async function recordScheduledMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  input: RecordMedicalEntryInput,
  actorId: string,
  today: CalendarDay,
  options: RecordScheduledEntryOptions = {},
): Promise<RecordedMedicalEntry> {
  requireOrdinaryCare(input);
  const entry = await lockScheduledEntry(tx, entryId, "recorded as given");
  const { animalId } = entry;
  if (input.kind !== entry.kind) {
    throw new MedicalEntryRefusal(
      `This entry is a scheduled ${KIND_NOUN[entry.kind]}, and an entry's kind can't change. Void it and record the ${KIND_NOUN[input.kind]} on its own.`,
    );
  }
  if (input.source === MedicalEntrySource.BEFORE_INTAKE) {
    throw new MedicalEntryRefusal(
      "Care scheduled during the animal's stay can't have been given before intake.",
      "source",
    );
  }

  const provenance = await reportEntryData(tx, animalId, input.source, options.vetReportId);
  const animal = await readAnimal(tx, animalId);
  const item = await checkCare(tx, input, animal, entry);
  const values = await givenValues(tx, input, item, animal, actorId, today);
  await checkRecordExtras(tx, input, animalId, animal, today);
  await checkChipNumberFree(tx, values.chipNumber, animalId, entryId);

  await writingChipNumber(values.chipNumber, () =>
    tx.medicalEntry.update({
      where: { id: entryId },
      data: {
        status: MedicalEntryStatus.COMPLETED,
        ...entryData(values),
        reportedByFoster: options.reportedByFoster ?? false,
        ...provenance,
        // The batch that gave it. One that scheduled it is kept in its
        // CREATED event.
        ...batchData(options.batch),
        ...detailsCreate(entry.kind, values),
      },
    }),
  );

  const { changedAt: entryLoggedAt } = await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: actorId,
      changeSummary: await recordedSummary(
        tx,
        item,
        entry.kind,
        values,
        entry.dueDate,
        options.batch,
      ),
    },
    select: { changedAt: true },
  });

  const { vitalsLogId, loggedAt: vitalsLoggedAt } = await writeExamVitals(
    tx,
    { entryId, animalId },
    input.vitals,
    actorId,
    entryLoggedAt,
    options.weightUnitSystem,
  );

  await tx.medicalEntryEvent.create({
    data: {
      entryId,
      action: MedicalEntryEventAction.COMPLETED,
      actorId,
      before: { status: MedicalEntryStatus.SCHEDULED },
      after: asJson({
        status: MedicalEntryStatus.COMPLETED,
        ...values,
        ...(options.reportedByFoster && { reportedByFoster: true }),
        ...provenance,
        ...batchData(options.batch),
        ...(vitalsLogId && { vitalsLogId }),
      }),
    },
  });

  await writeFoundAltered(
    tx,
    animalId,
    {
      entryId,
      examType: values.examType!,
      completedDate: values.completedDate,
    },
    input.foundAltered,
    actorId,
    today,
    vitalsLoggedAt,
  );

  const nextEntryId = await scheduleNextDose(
    tx,
    animalId,
    entry.kind,
    item,
    values.completedDate,
    input.scheduleNext,
    actorId,
    today,
    options,
  );
  return { entryId, animalId, nextEntryId };
}

/**
 * Corrects a recorded entry. A field the input leaves out keeps what is
 * stored, and null clears it. A save that changes nothing writes nothing.
 * Otherwise the entry is updated in place and one EDITED event and one
 * activity row record what moved and what it held before.
 *
 * The item can change within its kind. The catalog checks (not retired, for
 * this animal's species) apply only when it does: a correction to the lot
 * number is not refused because the item was retired since it was given.
 * Likewise a test keeps asking for the results it was recorded with until its
 * item changes, so an analyte added to the catalog later doesn't block it. A
 * surgery's procedure can be corrected too, and the sex rule applies only
 * when it changes. A surgery an exam found keeps its source and evidence.
 */
export async function editMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  input: MedicalEntryInput,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalEntryEdit> {
  requireOrdinaryCare(input);
  // An entry's animal never changes, so it can be read before the lock.
  const located = await tx.medicalEntry.findUnique({
    where: { id: entryId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Medical entry not found.");
  }
  const { animalId } = located;
  await lockAnimal(tx, animalId);

  const entry = await readStoredEntry(tx, entryId);
  if (!entry) {
    throw new NotFoundError("Medical entry not found.");
  }
  if (entry.voidedAt) {
    throw new ConflictError(
      entry.status === MedicalEntryStatus.COMPLETED
        ? "This entry was voided, so it can't be edited. Record it again instead."
        : "This entry was voided, so it can't be edited. Schedule it again instead.",
    );
  }
  // Only care that was given is corrected. Scheduled care is rescheduled, or
  // voided and scheduled again; a declined entry is final.
  if (entry.status !== MedicalEntryStatus.COMPLETED) {
    throw new ConflictError(
      entry.status === MedicalEntryStatus.SCHEDULED
        ? "This entry is scheduled and hasn't been given, so it can't be edited. Reschedule it, or void it and schedule it again."
        : "This entry was declined, so it can't be edited. If it was declined in error, void it.",
    );
  }
  if (input.kind !== entry.kind) {
    throw new MedicalEntryRefusal(
      `This entry is a ${KIND_NOUN[entry.kind]}, and an entry's kind can't change. Void it and record it again.`,
    );
  }

  const before = entry.values;
  if (input.kind === MedicalEntryKind.MICROCHIP) {
    const issue = microchipRegistrationReplacementIssue({
      chipNumber: before.chipNumber!,
      registrationStatus: before.registrationStatus!,
      registryName: before.registryName ?? null,
      registrationDate: before.registrationDate ? calendarDay(before.registrationDate) : null,
      registrationNotes: before.registrationNotes ?? null,
    }, input);
    if (issue) throw new MedicalEntryRefusal(issue.message, issue.field);
  }
  input = withStoredValues(input, before);
  // A surgery an exam found keeps how it was found: its link to that exam is
  // its evidence.
  if (
    entry.foundOnExamId &&
    input.kind === MedicalEntryKind.SURGERY &&
    (input.source !== before.source || (input.evidence ?? null) !== before.evidence)
  ) {
    throw new MedicalEntryRefusal(
      `This ${SURGERY_PROCEDURE_LABELS[before.procedure!].toLowerCase()} was found on an exam. Void it and record it again to change how it was found.`,
      "evidence",
    );
  }
  const animal = await readAnimal(tx, animalId);
  const item = await checkCare(tx, input, animal, before);
  // What the entry is held to: see `valuesFor`.
  const terms = {
    ...(!item || item.id !== before.itemId
      ? catalogTerms(item)
      : {
          // Every rabies entry stores its duration.
          isRabies: before.durationMonths != null,
          analytes: (before.results ?? []).map((row) => ({
            id: row.analyteId,
            name: row.analyteName,
          })),
        }),
    bodySystems: (before.examFindings ?? []).map((row) => row.bodySystem),
  };
  checkDay(input.kind, input.completedDate, input.source, animal, today);
  if (
    input.kind === MedicalEntryKind.EXAM &&
    (input.examType !== before.examType ||
      input.completedDate !== before.completedDate)
  ) {
    checkExamDay(input.examType, input.completedDate, animal);
  }

  const vetPartnerId = input.vetPartnerId || null;
  const vetName = tidy(input.vetName);
  await checkVet(
    tx,
    input.source,
    vetPartnerId,
    vetName,
    vetPartnerId !== before.vetPartnerId,
  );

  // Left out, who gave it stays as stored, except that care moved out of the
  // shelter drops the in-house default it was recorded with.
  const administeredById =
    input.administeredById !== undefined
      ? input.administeredById
      : input.source !== MedicalEntrySource.IN_HOUSE &&
          before.source === MedicalEntrySource.IN_HOUSE
        ? null
        : before.administeredById;

  const after = valuesFor(
    input,
    item,
    {
      completedDate: input.completedDate,
      source: input.source,
      vetPartnerId,
      vetName,
      administeredById,
      notes: tidy(input.notes),
    },
    { itemDefaults: false, ...terms, foundOnExam: entry.foundOnExamId !== null },
  );

  checkRegistrationDay(after, animal, today);
  const changed = (Object.keys(after) as EntryField[]).filter(
    (field) => !sameValue(before[field], after[field]),
  );
  if (changed.length === 0) {
    return { status: "unchanged", entryId, animalId };
  }
  const newChipNumber = changed.includes("chipNumber") ? after.chipNumber : null;
  await checkChipNumberFree(tx, newChipNumber ?? undefined, animalId, entryId);

  await writingChipNumber(newChipNumber, () =>
    tx.medicalEntry.update({
      where: { id: entryId },
      data: entryData(after),
    }),
  );
  switch (entry.kind) {
    case MedicalEntryKind.VACCINE:
      await tx.vaccineDetails.update({
        where: { entryId },
        data: vaccineData(after),
      });
      break;
    case MedicalEntryKind.TEST: {
      const details = await tx.testDetails.update({
        where: { entryId },
        data: testData(after),
        select: { id: true },
      });
      if (changed.includes("results")) {
        await tx.testAnalyteResult.deleteMany({
          where: { testDetailsId: details.id },
        });
        await tx.testAnalyteResult.createMany({
          data: after.results!.map((row) => ({ ...row, testDetailsId: details.id })),
        });
      }
      break;
    }
    case MedicalEntryKind.TREATMENT:
      await tx.treatmentDetails.update({
        where: { entryId },
        data: treatmentData(after),
      });
      break;
    case MedicalEntryKind.SURGERY:
      await tx.surgeryDetails.update({
        where: { entryId },
        data: surgeryData(after),
      });
      break;
    case MedicalEntryKind.MICROCHIP:
      await tx.microchipDetails.update({
        where: { entryId },
        data: microchipData(after),
      });
      break;
    case MedicalEntryKind.EXAM: {
      const details = await tx.examDetails.update({
        where: { entryId },
        data: examData(after),
        select: { id: true },
      });
      if (changed.includes("examFindings")) {
        await tx.examFinding.deleteMany({ where: { examDetailsId: details.id } });
        await tx.examFinding.createMany({
          data: after.examFindings!.map((row) => ({
            ...row,
            examDetailsId: details.id,
          })),
        });
      }
      break;
    }
  }

  const pick = (values: EntryValues) =>
    Object.fromEntries(changed.map((field) => [field, values[field] ?? null]));
  await tx.medicalEntryEvent.create({
    data: {
      entryId,
      action: MedicalEntryEventAction.EDITED,
      actorId,
      before: asJson(pick(before)),
      after: asJson(pick(after)),
    },
  });

  const names = await readNames(tx, [before, after]);
  const subject = subjectText({
    kind: entry.kind,
    item,
    procedure: after.procedure,
    chipNumber: after.chipNumber,
    examType: after.examType,
  });
  const changeSummary = `${subject} was corrected: ${joinList(
    changed.map((field) => describeChange(field, before, after, names)),
  )}.`;
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_EDITED,
      changedById: actorId,
      changeSummary,
    },
  });

  return { status: "edited", entryId, animalId, changeSummary };
}

/**
 * Voids an entry recorded or scheduled in error, whatever its status.
 * Write-once: an entry already voided is refused, and nothing un-voids one.
 */
export async function voidMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  reason: string,
  actorId: string,
): Promise<{ entryId: string; animalId: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new MedicalEntryRefusal(
      "A reason for voiding this entry is required.",
      "reason",
    );
  }

  const located = await tx.medicalEntry.findUnique({
    where: { id: entryId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Medical entry not found.");
  }
  const { animalId } = located;
  // Taken before the re-read, so two voids of one entry at once can't both
  // see it live.
  await lockAnimal(tx, animalId);

  const entry = await tx.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      kind: true,
      outcomeId: true,
      status: true,
      dueDate: true,
      completedDate: true,
      voidedAt: true,
      source: true,
      procedure: true,
      chipNumber: true,
      examType: true,
      exemptionReason: true,
      item: { select: { name: true } },
    },
  });
  requireOrdinaryCare(entry);
  if (entry.voidedAt) {
    throw new ConflictError(
      "This entry has already been voided. A void can't be undone: if it was voided by mistake, record the entry again.",
    );
  }

  await tx.medicalEntry.update({
    where: { id: entryId },
    data: {
      voidedAt: new Date(),
      voidedById: actorId,
      voidReason: trimmedReason,
    },
  });
  await tx.medicalEntryEvent.create({
    data: {
      entryId,
      action: MedicalEntryEventAction.VOIDED,
      actorId,
      after: { voidReason: trimmedReason },
    },
  });
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_VOIDED,
      changedById: actorId,
      // Care that was never given is named by the day it was due, and an
      // exemption as one.
      changeSummary:
        entry.exemptionReason && entry.procedure
          ? `${SURGERY_PROCEDURE_LABELS[entry.procedure]} exemption was voided. Reason: ${trimmedReason}`
          : `${subjectText(entry)} ${
              entry.status === MedicalEntryStatus.COMPLETED
                ? `${verbFor(entry.kind, entry.source)} on ${dayText(entry.completedDate)}`
                : `due ${dayText(entry.dueDate)}`
            } was voided. Reason: ${trimmedReason}`,
    },
  });

  return { entryId, animalId };
}
