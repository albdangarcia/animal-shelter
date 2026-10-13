import {
  DoseUnit,
  ExamFindingStatus,
  ExamResult,
  ExamType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
  ReproductiveStatus,
  SurgeryEvidence,
  SurgeryProcedure,
  TestResult,
} from "@/prisma/generated/enums";
import { PreconditionFailedError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { addCalendarMonths } from "@/app/lib/utils/medical-days";
import { chipNumberIssue, normaliseChipNumber } from "@/app/lib/utils/microchip";
import {
  examFindingsIssue,
  type ExamFindingInput,
} from "@/app/lib/utils/exam-findings";
import { EXAM_BODY_SYSTEM_KEYS } from "@/app/lib/constants/exam";

/**
 * What a medical entry holds, kind by kind: the input each kind takes, the
 * values it stores (flat, keyed by field name, as events record them), the
 * rules those values follow, and the rows they are written to. The entry
 * service reads the animal, the catalog and the database around these; the
 * rules here need only the input and what the entry is held to.
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

/** Care given from the catalog names its item. */
interface CatalogEntryCommonInput extends MedicalEntryCommonInput {
  itemId: string;
}

export interface VaccineEntryInput extends CatalogEntryCommonInput {
  kind: typeof MedicalEntryKind.VACCINE;
  manufacturer?: string | null;
  lotNumber?: string | null;
  lotExpiryDate?: CalendarDay | null;
  route?: MedicalRoute | null;
  site?: string | null;
  rabiesTagNumber?: string | null;
  durationMonths?: number | null;
}

export interface TestEntryInput extends CatalogEntryCommonInput {
  kind: typeof MedicalEntryKind.TEST;
  lotNumber?: string | null;
  lotExpiryDate?: CalendarDay | null;
  results: { analyteId: string; result: TestResult }[];
}

export interface TreatmentEntryInput extends CatalogEntryCommonInput {
  kind: typeof MedicalEntryKind.TREATMENT;
  doseAmount?: number | null;
  doseUnit?: DoseUnit | null;
  route?: MedicalRoute | null;
}

/**
 * A surgery. It has no catalog item: its procedure says what it was. The
 * surgeon is free text, since the surgeon is rarely a person in the system,
 * so nobody is stored as having given it (`administeredById` is ignored).
 */
export interface SurgeryEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.SURGERY;
  procedure: SurgeryProcedure;
  surgeon?: string | null;
  findings?: string | null;
  anesthesiaNotes?: string | null;
  /** What shows it was done, for a surgery done before intake, and only
   * then. */
  evidence?: SurgeryEvidence | null;
}

/**
 * A microchip. It has no catalog item: its number says which chip it is.
 * Who implanted it is its source: the shelter, an outside vet during the
 * stay, or nobody known when it was found on a scan before intake.
 */
export interface MicrochipEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.MICROCHIP;
  /** As typed: it is stored normalised. */
  chipNumber: string;
  brand?: string | null;
}

/**
 * An exam. It has no catalog item: its type says which exam it was. It has
 * a finding for every body system it looks at, and may say whether the
 * animal is intact or altered. An exam is given in house or by an outside
 * vet, never before intake.
 */
export interface ExamEntryInput extends MedicalEntryCommonInput {
  kind: typeof MedicalEntryKind.EXAM;
  examType: ExamType;
  overallResult: ExamResult;
  /** On an edit, left out keeps what is stored, and null clears it. */
  reproductiveStatus?: ReproductiveStatus | null;
  /** One per body system the exam is held to, always given in full. */
  findings: ExamFindingInput[];
}

export type MedicalEntryInput =
  | VaccineEntryInput
  | TestEntryInput
  | TreatmentEntryInput
  | SurgeryEntryInput
  | MicrochipEntryInput
  | ExamEntryInput;

export interface StoredResult {
  analyteId: string;
  analyteName: string;
  result: TestResult;
}

/** One body system's finding, as stored. */
export interface StoredFinding {
  bodySystem: string;
  status: ExamFindingStatus;
  notes: string | null;
}

/**
 * Every value an entry stores, flat and keyed by field name. Detail fields
 * keep their own names (`lotNumber`), and test results are `results`. This is
 * what an event's `before` and `after` hold, and what an edit compares.
 */
export interface EntryValues {
  /** Null for the kinds that aren't given from the catalog. */
  itemId: string | null;
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
  // Surgery. The procedure is on the entry; the rest are its details.
  procedure?: SurgeryProcedure;
  surgeon?: string | null;
  findings?: string | null;
  anesthesiaNotes?: string | null;
  evidence?: SurgeryEvidence | null;
  // Microchip. The number is on the entry; the brand is its details.
  chipNumber?: string;
  brand?: string | null;
  // Exam. The type is on the entry; the rest are its details. The findings
  // are `examFindings`, since a surgery's `findings` are its notes in words.
  examType?: ExamType;
  overallResult?: ExamResult;
  reproductiveStatus?: ReproductiveStatus | null;
  examFindings?: StoredFinding[];
}

export type EntryField = keyof EntryValues;

export const tidy = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

export interface CatalogItem {
  id: string;
  kind: MedicalEntryKind;
  name: string;
  manufacturer: string | null;
  defaultRoute: MedicalRoute | null;
  defaultDoseAmount: number | null;
  defaultDoseUnit: DoseUnit | null;
  isRabies: boolean;
  repeatIntervalDays: number | null;
  retiredAt: Date | null;
  species: { id: string }[];
  analytes: { id: string; name: string; retiredAt: Date | null }[];
}

export const KIND_NOUN: Record<MedicalEntryKind, string> = {
  VACCINE: "vaccine",
  TEST: "test",
  TREATMENT: "treatment",
  SURGERY: "surgery",
  MICROCHIP: "microchip",
  EXAM: "exam",
};

const RABIES_MAX_MONTHS = 36;

/**
 * What a new entry on `item` is held to: the catalog as it is now. Care with
 * no item (a surgery) is held to nothing from it.
 */
export const catalogTerms = (item: CatalogItem | null) =>
  item
    ? {
        isRabies: item.isRabies,
        analytes: item.analytes
          .filter((analyte) => !analyte.retiredAt)
          .map(({ id, name }) => ({ id, name })),
      }
    : { isRabies: false, analytes: [] };

/** The body systems a new exam is held to: those the code lists now. */
export const currentBodySystems = (): readonly string[] => EXAM_BODY_SYSTEM_KEYS;

/**
 * The values the input stores, after the per-kind rules. `itemDefaults` is
 * true for a new entry: blank defaults are filled in from the item then, and
 * never on an edit, so a field cleared on purpose stays clear.
 *
 * `isRabies` and `analytes` say what the entry is held to: the item's current
 * catalog values when it is recorded or its item changes, and what it was
 * recorded with otherwise, so changing the catalog later (renaming an
 * analyte, turning the rabies flag on or off) neither rewrites the entry nor
 * blocks a correction to it. `bodySystems` does the same for an exam: the
 * systems the code lists when it is recorded, and the ones it was recorded
 * with on an edit.
 */
export const valuesFor = (
  input: MedicalEntryInput,
  item: CatalogItem | null,
  common: Omit<EntryValues, "itemId">,
  options: {
    itemDefaults: boolean;
    isRabies: boolean;
    analytes: { id: string; name: string }[];
    bodySystems: readonly string[];
  },
): EntryValues => {
  if (input.kind === MedicalEntryKind.SURGERY) {
    return surgeryValues(input, common);
  }
  if (input.kind === MedicalEntryKind.MICROCHIP) {
    return microchipValues(input, common);
  }
  if (input.kind === MedicalEntryKind.EXAM) {
    return examValues(input, common, options.bodySystems);
  }
  if (!item) {
    throw new Error(`A ${KIND_NOUN[input.kind]} entry needs its catalog item.`);
  }
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

/**
 * A surgery's values. Its evidence is what shows a surgery done before intake
 * was done, so it is required then and refused otherwise. Nobody is stored
 * as having given it: the surgeon is free text.
 */
const surgeryValues = (
  input: SurgeryEntryInput,
  common: Omit<EntryValues, "itemId">,
): EntryValues => {
  const evidence = input.evidence ?? null;
  const beforeIntake = common.source === MedicalEntrySource.BEFORE_INTAKE;
  if (beforeIntake && !evidence) {
    throw new MedicalEntryRefusal(
      "Say what shows the surgery was done before intake.",
      "evidence",
    );
  }
  if (!beforeIntake && evidence) {
    throw new MedicalEntryRefusal(
      "Evidence is only for a surgery done before intake.",
      "evidence",
    );
  }
  return {
    itemId: null,
    ...common,
    administeredById: null,
    procedure: input.procedure,
    surgeon: tidy(input.surgeon),
    findings: tidy(input.findings),
    anesthesiaNotes: tidy(input.anesthesiaNotes),
    evidence,
  };
};

/**
 * A microchip's values. The number is stored normalised, and must be one a
 * chip can carry. Whether another entry already holds it needs the database,
 * so the service checks that.
 */
const microchipValues = (
  input: MicrochipEntryInput,
  common: Omit<EntryValues, "itemId">,
): EntryValues => {
  const chipNumber = normaliseChipNumber(input.chipNumber ?? "");
  const issue = chipNumberIssue(chipNumber);
  if (issue) {
    throw new MedicalEntryRefusal(issue, "chipNumber");
  }
  return {
    itemId: null,
    ...common,
    chipNumber,
    brand: tidy(input.brand),
  };
};

/**
 * An exam's values. It is given in house or by an outside vet: paperwork
 * from before intake isn't an exam the shelter can vouch for. Its findings
 * cover exactly the systems it is held to, in the order the code lists
 * them, with a note on each abnormal one. Who gave it follows the catalog
 * kinds: the person recording an in-house exam, unless named.
 */
const examValues = (
  input: ExamEntryInput,
  common: Omit<EntryValues, "itemId">,
  bodySystems: readonly string[],
): EntryValues => {
  if (common.source === MedicalEntrySource.BEFORE_INTAKE) {
    throw new MedicalEntryRefusal(
      "An exam is recorded in house or by an outside vet.",
      "source",
    );
  }
  if (!input.overallResult) {
    throw new MedicalEntryRefusal("Pick the overall result.", "overallResult");
  }
  const findings = input.findings ?? [];
  const issue = examFindingsIssue(findings, bodySystems);
  if (issue) {
    throw new MedicalEntryRefusal(issue, "findings");
  }
  return {
    itemId: null,
    ...common,
    examType: input.examType,
    overallResult: input.overallResult,
    reproductiveStatus: input.reproductiveStatus ?? null,
    examFindings: orderFindings(
      findings.map(({ bodySystem, status, notes }) => ({
        bodySystem,
        status,
        notes: tidy(notes),
      })),
    ),
  };
};

/**
 * Findings in the order the code lists the systems, any it no longer lists
 * after them by key, so a stored exam and its correction compare row by row.
 */
export const orderFindings = (findings: StoredFinding[]): StoredFinding[] => {
  const rank = (key: string) => {
    const at = EXAM_BODY_SYSTEM_KEYS.indexOf(key);
    return at === -1 ? EXAM_BODY_SYSTEM_KEYS.length : at;
  };
  return [...findings].sort(
    (a, b) =>
      rank(a.bodySystem) - rank(b.bodySystem) ||
      a.bodySystem.localeCompare(b.bodySystem),
  );
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
  "surgeon",
  "findings",
  "anesthesiaNotes",
  "evidence",
  "brand",
  "reproductiveStatus",
] as const;

export const withStoredValues = (
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

export const vaccineData = (values: EntryValues) => ({
  manufacturer: values.manufacturer ?? null,
  lotNumber: values.lotNumber ?? null,
  lotExpiryDate: values.lotExpiryDate ?? null,
  route: values.route ?? null,
  site: values.site ?? null,
  rabiesTagNumber: values.rabiesTagNumber ?? null,
  durationMonths: values.durationMonths ?? null,
  validUntilDate: values.validUntilDate ?? null,
});

export const testData = (values: EntryValues) => ({
  lotNumber: values.lotNumber ?? null,
  lotExpiryDate: values.lotExpiryDate ?? null,
});

export const treatmentData = (values: EntryValues) => ({
  doseAmount: values.doseAmount ?? null,
  doseUnit: values.doseUnit ?? null,
  route: values.route ?? null,
});

export const surgeryData = (values: EntryValues) => ({
  surgeon: values.surgeon ?? null,
  findings: values.findings ?? null,
  anesthesiaNotes: values.anesthesiaNotes ?? null,
  evidence: values.evidence ?? null,
});

export const microchipData = (values: EntryValues) => ({
  brand: values.brand ?? null,
});

export const examData = (values: EntryValues) => ({
  overallResult: values.overallResult!,
  reproductiveStatus: values.reproductiveStatus ?? null,
});

export const entryData = (values: EntryValues) => ({
  itemId: values.itemId,
  procedure: values.procedure ?? null,
  chipNumber: values.chipNumber ?? null,
  examType: values.examType ?? null,
  completedDate: values.completedDate,
  source: values.source,
  vetPartnerId: values.vetPartnerId,
  vetName: values.vetName,
  administeredById: values.administeredById,
  notes: values.notes,
});

/** The nested create for the kind's details row. */
export const detailsCreate = (kind: MedicalEntryKind, values: EntryValues) => ({
  ...(kind === MedicalEntryKind.VACCINE && {
    vaccine: { create: vaccineData(values) },
  }),
  ...(kind === MedicalEntryKind.TEST && {
    test: {
      create: {
        ...testData(values),
        results: { createMany: { data: values.results! } },
      },
    },
  }),
  ...(kind === MedicalEntryKind.TREATMENT && {
    treatment: { create: treatmentData(values) },
  }),
  ...(kind === MedicalEntryKind.SURGERY && {
    surgery: { create: surgeryData(values) },
  }),
  ...(kind === MedicalEntryKind.MICROCHIP && {
    microchip: { create: microchipData(values) },
  }),
  ...(kind === MedicalEntryKind.EXAM && {
    exam: {
      create: {
        ...examData(values),
        findings: { createMany: { data: values.examFindings! } },
      },
    },
  }),
});

