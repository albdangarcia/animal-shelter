import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  AnimalListingStatus,
  DoseUnit,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalRoute,
  PartnerType,
  TestResult,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import {
  calendarDay,
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { addCalendarMonths, dueDateIssue } from "@/app/lib/utils/medical-days";
import { lockMedicalItemForUse } from "@/app/lib/services/medical-catalog";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ROUTE_LABELS,
  TEST_RESULT_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";

/**
 * Scheduling, recording, correcting and voiding a vaccine, test or treatment
 * for an animal.
 *
 * Scheduled care is an entry with a due day and nothing else: no source, no
 * details row. Lot numbers and results are written only when it is given, so
 * they exist only for care that happened. Every read that derives a fact
 * counts only completed entries.
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

/** A refusal that belongs to one field of the entry form. */
export class MedicalEntryRefusal extends PreconditionFailedError {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "MedicalEntryRefusal";
    this.field = field;
  }
}

interface MedicalEntryCommonInput {
  itemId: string;
  /** Null only for care given before intake on a day nobody knows. */
  completedDate: CalendarDay | null;
  source: MedicalEntrySource;
  vetPartnerId?: string | null;
  vetName?: string | null;
  /**
   * Who gave it. On a new in-house entry, left out means the person recording
   * it; on an edit, left out keeps what is stored.
   */
  administeredById?: string | null;
  notes?: string | null;
}

export interface VaccineEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.VACCINE;
  manufacturer?: string | null;
  lotNumber?: string | null;
  lotExpiryDate?: CalendarDay | null;
  route?: MedicalRoute | null;
  site?: string | null;
  rabiesTagNumber?: string | null;
  durationMonths?: number | null;
}

export interface TestEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.TEST;
  lotNumber?: string | null;
  lotExpiryDate?: CalendarDay | null;
  results: { analyteId: string; result: TestResult }[];
}

export interface TreatmentEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.TREATMENT;
  doseAmount?: number | null;
  doseUnit?: DoseUnit | null;
  route?: MedicalRoute | null;
}

export type MedicalEntryInput =
  | VaccineEntryInput
  | TestEntryInput
  | TreatmentEntryInput;

/** Care to schedule: what, for whom, and the day it is due. */
export interface ScheduleMedicalEntryInput {
  animalId: string;
  kind: MedicalEntryKind;
  itemId: string;
  dueDate: CalendarDay;
  notes?: string | null;
}

export type MedicalEntryEdit =
  | { status: "edited"; entryId: string; animalId: string; changeSummary: string }
  | { status: "unchanged"; entryId: string; animalId: string };

// ---------------------------------------------------------------------------
// Stored values
// ---------------------------------------------------------------------------

interface StoredResult {
  analyteId: string;
  analyteName: string;
  result: TestResult;
}

/**
 * Every value an entry stores, flat and keyed by field name. Detail fields
 * keep their own names (`lotNumber`), and test results are `results`. This is
 * what an event's `before` and `after` hold, and what an edit compares.
 */
interface EntryValues {
  itemId: string;
  completedDate: string | null;
  source: MedicalEntrySource;
  vetPartnerId: string | null;
  vetName: string | null;
  administeredById: string | null;
  notes: string | null;
  // Vaccine
  manufacturer?: string | null;
  site?: string | null;
  rabiesTagNumber?: string | null;
  durationMonths?: number | null;
  validUntilDate?: string | null;
  // Vaccine and test
  lotNumber?: string | null;
  lotExpiryDate?: string | null;
  // Vaccine and treatment
  route?: MedicalRoute | null;
  // Test
  results?: StoredResult[];
  // Treatment
  doseAmount?: number | null;
  doseUnit?: DoseUnit | null;
}

type EntryField = keyof EntryValues;

const tidy = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// Prisma reads sibling relations of one row at the same time, which a
// transaction (one connection) can't do, so an entry and its details, and an
// item and its lists, are read one after the other.

type StoredEntry = {
  kind: MedicalEntryKind;
  dueDate: string | null;
  voidedAt: Date | null;
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
      status: true,
      dueDate: true,
      itemId: true,
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
  const { kind, status, dueDate, voidedAt, source, ...rest } = entry;
  if (status !== MedicalEntryStatus.COMPLETED) {
    return { kind, status, dueDate, voidedAt, values: null };
  }
  if (!source) {
    throw new Error(`Completed medical entry ${entryId} has no source.`);
  }
  const common = { ...rest, source };
  const stored = { kind, status, dueDate, voidedAt };

  switch (kind) {
    case MedicalEntryKind.VACCINE: {
      const vaccine = await tx.vaccineDetails.findUniqueOrThrow({
        where: { entryId },
      });
      const values: EntryValues = {
        ...common,
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
  }
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

interface CatalogItem {
  id: string;
  kind: MedicalEntryKind;
  name: string;
  manufacturer: string | null;
  defaultRoute: MedicalRoute | null;
  defaultDoseAmount: number | null;
  defaultDoseUnit: DoseUnit | null;
  isRabies: boolean;
  retiredAt: Date | null;
  species: { id: string }[];
  analytes: { id: string; name: string; retiredAt: Date | null }[];
}

const KIND_NOUN: Record<MedicalEntryKind, string> = {
  VACCINE: "vaccine",
  TEST: "test",
  TREATMENT: "treatment",
};

// How the activity text says the care happened.
const KIND_VERB: Record<MedicalEntryKind, string> = {
  VACCINE: "given",
  TEST: "run",
  TREATMENT: "given",
};

const RABIES_MAX_MONTHS = 36;

interface AnimalFacts {
  speciesId: string;
  /** Out of the shelter's care: its listing is archived. */
  archived: boolean;
  firstIntakeDate: CalendarDay | null;
  latestIntakeDate: CalendarDay | null;
}

const readAnimal = async (
  tx: TransactionClient,
  animalId: string,
): Promise<AnimalFacts> => {
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: {
      speciesId: true,
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
  // Item and entry kinds are separate enums with the same values.
  return { ...item, kind: item.kind as MedicalEntryKind, species, analytes };
};

/** What a new entry on `item` is held to: the catalog as it is now. */
const catalogTerms = (item: CatalogItem) => ({
  isRabies: item.isRabies,
  analytes: item.analytes
    .filter((analyte) => !analyte.retiredAt)
    .map(({ id, name }) => ({ id, name })),
});

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

const checkDay = (
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
  if (completedDate > today) {
    throw new MedicalEntryRefusal(
      "The date given can't be in the future.",
      "completedDate",
    );
  }
  if (
    source !== MedicalEntrySource.BEFORE_INTAKE &&
    animal.firstIntakeDate &&
    completedDate < animal.firstIntakeDate
  ) {
    throw new MedicalEntryRefusal(
      `The date given can't be before the animal's intake on ${formatShelterDay(animal.firstIntakeDate)}. Care given before the animal arrived is recorded as before intake.`,
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
 * Refuses a due day the scheduling rules don't allow: before today, or too
 * far ahead.
 */
export const checkDueDate = (dueDate: CalendarDay, today: CalendarDay) => {
  const issue = dueDateIssue(dueDate, today);
  if (issue) {
    throw new MedicalEntryRefusal(issue, "dueDate");
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
  const partner = await tx.partner.findUnique({
    where: { id: vetPartnerId },
    select: { type: true, isActive: true },
  });
  if (!partner || partner.type !== PartnerType.VET_CLINIC || !partner.isActive) {
    throw new MedicalEntryRefusal(
      "Pick a vet clinic from the partner directory.",
      "vetPartnerId",
    );
  }
};

/**
 * The values the input stores, after the per-kind rules. `itemDefaults` is
 * true for a new entry: blank defaults are filled in from the item then, and
 * never on an edit, so a field cleared on purpose stays clear.
 *
 * `isRabies` and `analytes` say what the entry is held to: the item's current
 * catalog values when it is recorded or its item changes, and what it was
 * recorded with otherwise, so changing the catalog later (renaming an
 * analyte, turning the rabies flag on or off) neither rewrites the entry nor
 * blocks a correction to it.
 */
const valuesFor = (
  input: MedicalEntryInput,
  item: CatalogItem,
  common: Omit<EntryValues, "itemId">,
  options: {
    itemDefaults: boolean;
    isRabies: boolean;
    analytes: { id: string; name: string }[];
  },
): EntryValues => {
  const base: EntryValues = { itemId: item.id, ...common };

  if (input.kind === MedicalEntryKind.VACCINE) {
    const rabiesTagNumber = tidy(input.rabiesTagNumber);
    const durationMonths = input.durationMonths ?? null;
    if (options.isRabies) {
      if (durationMonths === null) {
        throw new MedicalEntryRefusal(
          "A rabies vaccine needs its duration.",
          "durationMonths",
        );
      }
      if (
        !Number.isInteger(durationMonths) ||
        durationMonths < 1 ||
        durationMonths > RABIES_MAX_MONTHS
      ) {
        throw new MedicalEntryRefusal(
          `The duration must be a whole number of months, from 1 to ${RABIES_MAX_MONTHS}.`,
          "durationMonths",
        );
      }
    } else if (rabiesTagNumber || durationMonths !== null) {
      throw new MedicalEntryRefusal(
        "Only a rabies vaccine has a tag number and duration.",
        rabiesTagNumber ? "rabiesTagNumber" : "durationMonths",
      );
    }
    const completedDate = common.completedDate
      ? calendarDay(common.completedDate)
      : null;
    return {
      ...base,
      manufacturer:
        tidy(input.manufacturer) ??
        (options.itemDefaults ? item.manufacturer : null),
      lotNumber: tidy(input.lotNumber),
      lotExpiryDate: input.lotExpiryDate ?? null,
      route:
        input.route ?? (options.itemDefaults ? item.defaultRoute : null),
      site: tidy(input.site),
      rabiesTagNumber: options.isRabies ? rabiesTagNumber : null,
      durationMonths: options.isRabies ? durationMonths : null,
      validUntilDate:
        options.isRabies && completedDate && durationMonths
          ? addCalendarMonths(completedDate, durationMonths)
          : null,
    };
  }

  if (input.kind === MedicalEntryKind.TEST) {
    const expected = options.analytes.map((analyte) => analyte.id);
    const names = new Map(
      options.analytes.map((analyte) => [analyte.id, analyte.name]),
    );
    const given = new Map<string, TestResult>();
    for (const row of input.results) {
      if (!expected.includes(row.analyteId)) {
        throw new MedicalEntryRefusal(
          `A result was given for something ${item.name} doesn't report.`,
          "results",
        );
      }
      if (given.has(row.analyteId)) {
        throw new MedicalEntryRefusal(
          `${names.get(row.analyteId)} has more than one result.`,
          "results",
        );
      }
      given.set(row.analyteId, row.result);
    }
    const missing = expected.filter((id) => !given.has(id));
    if (missing.length > 0) {
      throw new MedicalEntryRefusal(
        `A result is needed for ${missing.map((id) => names.get(id)).join(" and ")}.`,
        "results",
      );
    }
    return {
      ...base,
      lotNumber: tidy(input.lotNumber),
      lotExpiryDate: input.lotExpiryDate ?? null,
      results: expected.map((analyteId) => ({
        analyteId,
        analyteName: names.get(analyteId)!,
        result: given.get(analyteId)!,
      })),
    };
  }

  const doseAmount =
    input.doseAmount ?? (options.itemDefaults ? item.defaultDoseAmount : null);
  const doseUnit =
    input.doseUnit ?? (options.itemDefaults ? item.defaultDoseUnit : null);
  if (doseAmount !== null && !(doseAmount > 0)) {
    throw new MedicalEntryRefusal("The dose must be more than zero.", "doseAmount");
  }
  if (doseAmount !== null && !doseUnit) {
    throw new MedicalEntryRefusal("A dose needs a unit.", "doseUnit");
  }
  return {
    ...base,
    doseAmount,
    doseUnit,
    route: input.route ?? (options.itemDefaults ? item.defaultRoute : null),
  };
};

// The optional fields an edit may leave out. Left out (undefined) keeps what
// is stored; null clears it.
const KEPT_WHEN_LEFT_OUT = [
  "vetPartnerId",
  "vetName",
  "notes",
  "manufacturer",
  "lotNumber",
  "lotExpiryDate",
  "route",
  "site",
  "rabiesTagNumber",
  "durationMonths",
  "doseAmount",
  "doseUnit",
] as const;

const withStoredValues = (
  input: MedicalEntryInput,
  before: EntryValues,
): MedicalEntryInput => {
  const filled: Record<string, unknown> = { ...input };
  for (const field of KEPT_WHEN_LEFT_OUT) {
    if (filled[field] === undefined && before[field] !== undefined) {
      filled[field] = before[field];
    }
  }
  return filled as unknown as MedicalEntryInput;
};

// ---------------------------------------------------------------------------
// Writing the details
// ---------------------------------------------------------------------------

const vaccineData = (values: EntryValues) => ({
  manufacturer: values.manufacturer ?? null,
  lotNumber: values.lotNumber ?? null,
  lotExpiryDate: values.lotExpiryDate ?? null,
  route: values.route ?? null,
  site: values.site ?? null,
  rabiesTagNumber: values.rabiesTagNumber ?? null,
  durationMonths: values.durationMonths ?? null,
  validUntilDate: values.validUntilDate ?? null,
});

const testData = (values: EntryValues) => ({
  lotNumber: values.lotNumber ?? null,
  lotExpiryDate: values.lotExpiryDate ?? null,
});

const treatmentData = (values: EntryValues) => ({
  doseAmount: values.doseAmount ?? null,
  doseUnit: values.doseUnit ?? null,
  route: values.route ?? null,
});

const entryData = (values: EntryValues) => ({
  itemId: values.itemId,
  completedDate: values.completedDate,
  source: values.source,
  vetPartnerId: values.vetPartnerId,
  vetName: values.vetName,
  administeredById: values.administeredById,
  notes: values.notes,
});

const asJson = (value: object) => value as Prisma.InputJsonObject;

// ---------------------------------------------------------------------------
// Activity text
// ---------------------------------------------------------------------------

// "a", "a and b", "a, b and c".
const joinList = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const dayText = (day: string | null | undefined) =>
  day ? formatShelterDay(calendarDay(day)) : "an unknown date";

const describeResults = (results: StoredResult[] | undefined) =>
  results && results.length > 0
    ? results
        .map((row) => `${row.analyteName} ${TEST_RESULT_LABELS[row.result].toLowerCase()}`)
        .join(", ")
    : null;

const FIELD_LABELS: Record<Exclude<EntryField, "notes">, string> = {
  itemId: "item",
  completedDate: "date given",
  source: "source",
  vetPartnerId: "vet clinic",
  vetName: "vet",
  administeredById: "person who gave it",
  manufacturer: "manufacturer",
  lotNumber: "lot number",
  lotExpiryDate: "lot expiry",
  route: "route",
  site: "site",
  rabiesTagNumber: "rabies tag",
  durationMonths: "duration",
  validUntilDate: "valid-until date",
  results: "results",
  doseAmount: "dose",
  doseUnit: "dose unit",
};

const SOURCE_TEXT: Record<MedicalEntrySource, string> = {
  IN_HOUSE: "in house",
  OUTSIDE_VET: "by an outside vet",
  BEFORE_INTAKE: "before intake",
};

interface Names {
  items: Map<string, string>;
  partners: Map<string, string>;
  people: Map<string, string>;
}

const readNames = async (
  tx: TransactionClient,
  values: EntryValues[],
): Promise<Names> => {
  const ids = (pick: (v: EntryValues) => string | null) => [
    ...new Set(values.map(pick).filter((id): id is string => !!id)),
  ];
  // One after another: a transaction is one connection.
  const items = await tx.medicalItem.findMany({
    where: { id: { in: ids((v) => v.itemId) } },
    select: { id: true, name: true },
  });
  const partners = await tx.partner.findMany({
    where: { id: { in: ids((v) => v.vetPartnerId) } },
    select: { id: true, name: true },
  });
  const people = await tx.person.findMany({
    where: { id: { in: ids((v) => v.administeredById) } },
    select: { id: true, name: true },
  });
  const toMap = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.id, row.name]));
  return { items: toMap(items), partners: toMap(partners), people: toMap(people) };
};

const displayValue = (
  field: Exclude<EntryField, "notes">,
  values: EntryValues,
  names: Names,
): string | null => {
  switch (field) {
    case "itemId":
      return names.items.get(values.itemId) ?? null;
    case "completedDate":
      return values.completedDate ? dayText(values.completedDate) : "unknown";
    case "lotExpiryDate":
    case "validUntilDate":
      return values[field] ? dayText(values[field]) : null;
    case "source":
      return SOURCE_TEXT[values.source];
    case "vetPartnerId":
      return values.vetPartnerId
        ? (names.partners.get(values.vetPartnerId) ?? null)
        : null;
    case "administeredById":
      return values.administeredById
        ? (names.people.get(values.administeredById) ?? null)
        : null;
    case "route":
      return values.route ? MEDICAL_ROUTE_LABELS[values.route] : null;
    case "durationMonths":
      return values.durationMonths ? `${values.durationMonths} months` : null;
    case "results":
      return describeResults(values.results);
    case "doseAmount":
      return values.doseAmount !== null && values.doseAmount !== undefined
        ? values.doseUnit
          ? formatDose(values.doseAmount, values.doseUnit)
          : String(values.doseAmount)
        : null;
    case "doseUnit":
      return values.doseUnit ? DOSE_UNIT_LABELS[values.doseUnit] : null;
    default:
      return (values[field] as string | null | undefined) ?? null;
  }
};

const describeChange = (
  field: EntryField,
  before: EntryValues,
  after: EntryValues,
  names: Names,
): string => {
  if (field === "notes") {
    return !before.notes
      ? "notes were added"
      : !after.notes
        ? "notes were removed"
        : "notes were edited";
  }
  const from = displayValue(field, before, names);
  const to = displayValue(field, after, names);
  const label = FIELD_LABELS[field];
  if (from === null) return `the ${label} was set to ${to}`;
  if (to === null) return `the ${label} was cleared (was ${from})`;
  return `the ${label} changed from ${from} to ${to}`;
};

// ---------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Schedules a vaccine, test or treatment for a due day. The entry holds the
 * item, the day and any notes, and nothing about how it will be given: that
 * is written when it is recorded as given.
 *
 * Only an animal in the shelter's care can have care scheduled. Recording,
 * declining and voiding what is already scheduled work after it leaves, so
 * its open entries can still be cleared.
 */
export async function scheduleMedicalEntry(
  tx: TransactionClient,
  input: ScheduleMedicalEntryInput,
  actorId: string,
  today: CalendarDay,
): Promise<{ entryId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so nothing can be scheduled for it.",
    );
  }
  // Held until commit, as when recording.
  await lockMedicalItemForUse(tx, input.itemId);
  const item = await readItem(tx, input.itemId);
  checkItemPickable(item, input.kind, animal);
  checkDueDate(input.dueDate, today);

  const notes = tidy(input.notes);
  const entry = await tx.medicalEntry.create({
    data: {
      animalId,
      kind: input.kind,
      itemId: item.id,
      status: MedicalEntryStatus.SCHEDULED,
      dueDate: input.dueDate,
      notes,
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
        itemId: item.id,
        dueDate: input.dueDate,
        notes,
      }),
    },
  });

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
      changedById: actorId,
      changeSummary: `${item.name} ${KIND_NOUN[input.kind]} scheduled for ${dayText(input.dueDate)}.`,
    },
  });

  return { entryId: entry.id, animalId };
}

/**
 * Records a vaccine, test or treatment as given. Blank defaults (manufacturer,
 * route, dose) are filled in from the catalog item, so changing the item's
 * defaults later never rewrites this entry.
 */
export async function recordMedicalEntry(
  tx: TransactionClient,
  input: MedicalEntryInput & { animalId: string },
  actorId: string,
  today: CalendarDay,
): Promise<{ entryId: string; animalId: string }> {
  const { animalId } = input;
  await lockAnimal(tx, animalId);

  const animal = await readAnimal(tx, animalId);
  // Held until commit, so the item can't change kind or retire between this
  // check and the entry being written.
  await lockMedicalItemForUse(tx, input.itemId);
  const item = await readItem(tx, input.itemId);
  checkItemPickable(item, input.kind, animal);
  checkDay(input.completedDate, input.source, animal, today);

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
    { itemDefaults: true, ...catalogTerms(item) },
  );

  const entry = await tx.medicalEntry.create({
    data: {
      animalId,
      kind: input.kind,
      status: MedicalEntryStatus.COMPLETED,
      createdById: actorId,
      ...entryData(values),
      ...(input.kind === MedicalEntryKind.VACCINE && {
        vaccine: { create: vaccineData(values) },
      }),
      ...(input.kind === MedicalEntryKind.TEST && {
        test: {
          create: {
            ...testData(values),
            results: { createMany: { data: values.results! } },
          },
        },
      }),
      ...(input.kind === MedicalEntryKind.TREATMENT && {
        treatment: { create: treatmentData(values) },
      }),
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
        status: MedicalEntryStatus.COMPLETED,
        ...values,
      }),
    },
  });

  const partnerName = vetPartnerId
    ? (await readNames(tx, [values])).partners.get(vetPartnerId)
    : undefined;
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: actorId,
      changeSummary: `${item.name} ${KIND_NOUN[input.kind]} recorded: ${KIND_VERB[input.kind]} ${SOURCE_TEXT[input.source]}${partnerName ? ` at ${partnerName}` : ""}, on ${dayText(values.completedDate)}.${
        values.results ? ` Results: ${describeResults(values.results)}.` : ""
      }`,
    },
  });

  return { entryId: entry.id, animalId };
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
 * item changes, so an analyte added to the catalog later doesn't block it.
 */
export async function editMedicalEntry(
  tx: TransactionClient,
  entryId: string,
  input: MedicalEntryInput,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalEntryEdit> {
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
  input = withStoredValues(input, before);
  const animal = await readAnimal(tx, animalId);
  const itemChanged = input.itemId !== before.itemId;
  await lockMedicalItemForUse(tx, input.itemId);
  const item = await readItem(tx, input.itemId);
  if (itemChanged) {
    checkItemPickable(item, input.kind, animal);
  }
  checkDay(input.completedDate, input.source, animal, today);

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
    {
      itemDefaults: false,
      ...(itemChanged
        ? catalogTerms(item)
        : {
            // Every rabies entry stores its duration.
            isRabies: before.durationMonths != null,
            analytes: (before.results ?? []).map((row) => ({
              id: row.analyteId,
              name: row.analyteName,
            })),
          }),
    },
  );

  const changed = (Object.keys(after) as EntryField[]).filter(
    (field) => !sameValue(before[field], after[field]),
  );
  if (changed.length === 0) {
    return { status: "unchanged", entryId, animalId };
  }

  await tx.medicalEntry.update({
    where: { id: entryId },
    data: entryData(after),
  });
  if (entry.kind === MedicalEntryKind.VACCINE) {
    await tx.vaccineDetails.update({
      where: { entryId },
      data: vaccineData(after),
    });
  } else if (entry.kind === MedicalEntryKind.TEST) {
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
  } else {
    await tx.treatmentDetails.update({
      where: { entryId },
      data: treatmentData(after),
    });
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
  const changeSummary = `${item.name} ${KIND_NOUN[entry.kind]} was corrected: ${joinList(
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
      status: true,
      dueDate: true,
      completedDate: true,
      voidedAt: true,
      item: { select: { name: true } },
    },
  });
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
      // Care that was never given is named by the day it was due.
      changeSummary: `${entry.item.name} ${KIND_NOUN[entry.kind]} ${
        entry.status === MedicalEntryStatus.COMPLETED
          ? `${KIND_VERB[entry.kind]} on ${dayText(entry.completedDate)}`
          : `due ${dayText(entry.dueDate)}`
      } was voided. Reason: ${trimmedReason}`,
    },
  });

  return { entryId, animalId };
}
