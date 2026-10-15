import type { TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  ExamType,
  MedicalProtocolStepKind,
} from "@/prisma/generated/enums";
import {
  MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS,
  MAX_PROTOCOL_OFFSET_DAYS,
  MAX_PROTOCOL_STEP_DOSES,
  MEDICAL_PROTOCOL_NAME_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";
import { lockMedicalItemForUse } from "@/app/lib/services/medical-catalog";
import {
  coveredAgesText,
  speciesPlural,
} from "@/app/lib/utils/medical-protocol-text";

/**
 * Medical protocols: for one species and an age range on the intake day, the
 * care an animal is scheduled when it arrives. Admins manage them beside the
 * catalog. Applying one at intake writes scheduled entries that then stand on
 * their own, so nothing here ever touches an entry.
 *
 * Protocols and their steps are retired, never deleted. A saved step's care
 * fields never change: saving the step list keeps a step that is listed
 * unchanged (only its place in the order moves), and retires a step that
 * changed or was left out, adding the changed one as a new step. So an
 * entry's `protocolStepId` always points at the care that was applied.
 *
 * Live protocols of one species never cover the same age, so at most one
 * fits an animal. The range is `[minAgeDays, maxAgeDays)`; a null end is open.
 *
 * This module has **no `next/*` and no auth imports**, so a plain `node:test`
 * can drive it. Each function runs inside the caller's `prisma.$transaction`,
 * and reads inside it run one after another.
 */

/** A protocol write refused, with the form field it is about. */
export class MedicalProtocolRefusal extends PreconditionFailedError {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "MedicalProtocolRefusal";
    this.field = field;
  }
}

export interface MedicalProtocolStepInput {
  /** A live step of this protocol, listed again. Absent for a new one. */
  id?: string | null;
  kind: MedicalProtocolStepKind;
  /** The catalog item, for a vaccine, test or treatment step. */
  itemId?: string | null;
  /** Which exam, for an exam step. */
  examType?: ExamType | null;
  offsetDays: number;
  notBeforeAgeDays?: number | null;
  repeatIntervalDays?: number | null;
  repeatCount?: number | null;
  untilAgeDays?: number | null;
  notes?: string | null;
}

export interface MedicalProtocolInput {
  name: string;
  speciesId: string;
  minAgeDays?: number | null;
  maxAgeDays?: number | null;
  /** In the order the protocol lists them. */
  steps: MedicalProtocolStepInput[];
}

/** The longest notes a step can carry, the same as an entry's. */
const STEP_NOTES_MAX_LENGTH = 2000;

const CATALOG_STEP_KINDS: ReadonlySet<MedicalProtocolStepKind> = new Set([
  MedicalProtocolStepKind.VACCINE,
  MedicalProtocolStepKind.TEST,
  MedicalProtocolStepKind.TREATMENT,
]);

const KIND_NOUN: Record<MedicalProtocolStepKind, string> = {
  VACCINE: "vaccine",
  TEST: "test",
  TREATMENT: "treatment",
  SPAY_NEUTER: "spay/neuter",
  EXAM: "exam",
  MICROCHIP: "microchip",
};

/** "a vaccine step", "an exam step". */
const aStep = (kind: MedicalProtocolStepKind) => {
  const noun = KIND_NOUN[kind];
  return `${/^[aeiou]/.test(noun) ? "An" : "A"} ${noun} step`;
};

const tidyName = (value: string) => value.trim().replace(/\s+/g, " ");

const tidyNotes = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** What a step is: every field but its place in the order. */
interface StepCare {
  kind: MedicalProtocolStepKind;
  itemId: string | null;
  examType: ExamType | null;
  offsetDays: number;
  notBeforeAgeDays: number | null;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  untilAgeDays: number | null;
  notes: string | null;
}

interface NormalisedProtocol {
  name: string;
  speciesId: string;
  minAgeDays: number | null;
  maxAgeDays: number | null;
  steps: (StepCare & { id: string | null })[];
}

const isWholeNumber = (value: number) => Number.isInteger(value);

/** That `value`, when set, is a whole number from `min` to `max`. */
const checkDays = (
  value: number | null,
  field: string,
  label: string,
  min: number,
  max: number | null,
) => {
  if (value === null) return;
  if (!isWholeNumber(value)) {
    throw new MedicalProtocolRefusal(`${label} must be a whole number of days.`, field);
  }
  if (value < min || (max !== null && value > max)) {
    throw new MedicalProtocolRefusal(
      max === null
        ? `${label} must be at least ${min} ${min === 1 ? "day" : "days"}.`
        : `${label} must be from ${min} to ${max} days.`,
      field,
    );
  }
};

/** A step's rules that need nothing but the input. */
const normaliseStep = (
  step: MedicalProtocolStepInput,
  index: number,
): StepCare & { id: string | null } => {
  const field = (name: string) => `steps.${index}.${name}`;
  const noun = KIND_NOUN[step.kind];
  const itemId = step.itemId ?? null;
  const examType = step.examType ?? null;
  const catalog = CATALOG_STEP_KINDS.has(step.kind);

  if (catalog && !itemId) {
    throw new MedicalProtocolRefusal(`Pick the ${noun}.`, field("itemId"));
  }
  if (!catalog && itemId) {
    throw new MedicalProtocolRefusal(
      `${aStep(step.kind)} has no catalog item.`,
      field("itemId"),
    );
  }
  if (step.kind === MedicalProtocolStepKind.EXAM && !examType) {
    throw new MedicalProtocolRefusal("Pick the exam type.", field("examType"));
  }
  if (step.kind !== MedicalProtocolStepKind.EXAM && examType) {
    throw new MedicalProtocolRefusal(
      `${aStep(step.kind)} has no exam type.`,
      field("examType"),
    );
  }

  const offsetDays = step.offsetDays;
  checkDays(offsetDays, field("offsetDays"), "The offset", 0, MAX_PROTOCOL_OFFSET_DAYS);
  const notBeforeAgeDays = step.notBeforeAgeDays ?? null;
  checkDays(
    notBeforeAgeDays,
    field("notBeforeAgeDays"),
    "The earliest age",
    0,
    MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS,
  );

  const repeatIntervalDays = step.repeatIntervalDays ?? null;
  const repeatCount = step.repeatCount ?? null;
  const untilAgeDays = step.untilAgeDays ?? null;
  // Only care from the catalog repeats; a step that waits for an age to stop
  // is a one-off dose for the young, which a catalog step may be too.
  if (!catalog && (repeatIntervalDays !== null || repeatCount !== null || untilAgeDays !== null)) {
    throw new MedicalProtocolRefusal(
      `${aStep(step.kind)} doesn't repeat.`,
      field(repeatIntervalDays !== null ? "repeatIntervalDays" : repeatCount !== null ? "repeatCount" : "untilAgeDays"),
    );
  }
  checkDays(
    repeatIntervalDays,
    field("repeatIntervalDays"),
    "The repeat interval",
    1,
    MAX_REPEAT_INTERVAL_DAYS,
  );
  checkDays(
    repeatCount,
    field("repeatCount"),
    "The number of repeats",
    1,
    MAX_PROTOCOL_STEP_DOSES - 1,
  );
  checkDays(untilAgeDays, field("untilAgeDays"), "The age to stop at", 1, null);
  if (repeatIntervalDays !== null && repeatCount === null && untilAgeDays === null) {
    throw new MedicalProtocolRefusal(
      "A repeating step needs a number of repeats, an age to stop at, or both.",
      field("repeatCount"),
    );
  }
  if (repeatCount !== null && repeatIntervalDays === null) {
    throw new MedicalProtocolRefusal(
      "Repeats need an interval.",
      field("repeatIntervalDays"),
    );
  }
  // Such a step could never schedule anything.
  if (untilAgeDays !== null && notBeforeAgeDays !== null && untilAgeDays <= notBeforeAgeDays) {
    throw new MedicalProtocolRefusal(
      "The age to stop at must be after the earliest age.",
      field("untilAgeDays"),
    );
  }

  const notes = tidyNotes(step.notes);
  if (notes && notes.length > STEP_NOTES_MAX_LENGTH) {
    throw new MedicalProtocolRefusal(
      `Notes must be ${STEP_NOTES_MAX_LENGTH} characters or fewer.`,
      field("notes"),
    );
  }

  return {
    id: step.id ?? null,
    kind: step.kind,
    itemId,
    examType,
    offsetDays,
    notBeforeAgeDays,
    repeatIntervalDays,
    repeatCount,
    untilAgeDays,
    notes,
  };
};

/** The rules that need nothing but the input. */
const normalise = (input: MedicalProtocolInput): NormalisedProtocol => {
  const name = tidyName(input.name);
  if (!name) {
    throw new MedicalProtocolRefusal("A name is required.", "name");
  }
  if (name.length > MEDICAL_PROTOCOL_NAME_MAX_LENGTH) {
    throw new MedicalProtocolRefusal(
      `The name must be ${MEDICAL_PROTOCOL_NAME_MAX_LENGTH} characters or fewer.`,
      "name",
    );
  }

  const minAgeDays = input.minAgeDays ?? null;
  const maxAgeDays = input.maxAgeDays ?? null;
  checkDays(minAgeDays, "minAgeDays", "The youngest age", 0, null);
  checkDays(maxAgeDays, "maxAgeDays", "The age it stops at", 1, null);
  if (minAgeDays !== null && maxAgeDays !== null && maxAgeDays <= minAgeDays) {
    throw new MedicalProtocolRefusal(
      "The age it stops at must be older than the youngest age.",
      "maxAgeDays",
    );
  }

  if (input.steps.length === 0) {
    throw new MedicalProtocolRefusal("A protocol needs at least one step.", "steps");
  }
  const steps = input.steps.map(normaliseStep);
  const ids = steps.flatMap((step) => (step.id ? [step.id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new MedicalProtocolRefusal("A step is listed twice.", "steps");
  }

  return { name, speciesId: input.speciesId, minAgeDays, maxAgeDays, steps };
};

/**
 * Holds one protocol against changes until the transaction ends. Every
 * protocol write takes it first, and applying a protocol at intake takes
 * `lockMedicalProtocolForUse`, so the steps an intake reads can't be retired
 * under it.
 */
export const lockMedicalProtocol = (tx: TransactionClient, protocolId: string) =>
  tx.$queryRaw`SELECT id FROM medical_protocols WHERE id = ${protocolId} FOR NO KEY UPDATE`;

/**
 * Held while a protocol is applied. Shared, so intakes don't wait for each
 * other, only for a protocol write.
 */
export const lockMedicalProtocolForUse = (tx: TransactionClient, protocolId: string) =>
  tx.$queryRaw`SELECT id FROM medical_protocols WHERE id = ${protocolId} FOR SHARE`;

const duplicateMessage = (name: string, retired: boolean) =>
  retired
    ? `A retired protocol named "${name}" already exists. Unretire it instead.`
    : `A protocol named "${name}" already exists.`;

/**
 * Names are unique among all protocols, retired ones included, ignoring case.
 * The unique index only knows the exact spelling, so two writes of "Puppy"
 * and "puppy" at once are serialised on a lock keyed by the name in the
 * database's lower case (the same `lower()` the check compares with; a
 * case-insensitive `equals` would be sent as ILIKE, reading `_` and `%` as a
 * pattern), and the second sees the first.
 */
const refuseDuplicateName = async (
  tx: TransactionClient,
  name: string,
  excludeId?: string,
) => {
  await tx.$queryRaw`
    SELECT 1 FROM pg_advisory_xact_lock(hashtext('medical_protocol:' || lower(${name})))`;
  const [existing] = await tx.$queryRaw<{ name: string; retiredAt: Date | null }[]>`
    SELECT name, retired_at AS "retiredAt" FROM medical_protocols
    WHERE lower(name) = lower(${name})
      AND id IS DISTINCT FROM ${excludeId ?? null}
    LIMIT 1`;
  if (existing) {
    throw new MedicalProtocolRefusal(
      duplicateMessage(existing.name, existing.retiredAt !== null),
      "name",
    );
  }
};

const readSpecies = async (tx: TransactionClient, speciesId: string) => {
  const species = await tx.species.findFirst({
    where: { id: speciesId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!species) {
    throw new MedicalProtocolRefusal("That species no longer exists.", "speciesId");
  }
  return species;
};

/**
 * Live protocols of one species never cover the same age. Two writes for one
 * species at once are serialised on a lock keyed by the species, so the
 * second sees the first.
 */
const refuseOverlap = async (
  tx: TransactionClient,
  species: { id: string; name: string },
  range: { minAgeDays: number | null; maxAgeDays: number | null },
  excludeId?: string,
) => {
  await tx.$queryRaw`
    SELECT 1 FROM pg_advisory_xact_lock(hashtext('medical_protocol_species:' || ${species.id}))`;
  const others = await tx.medicalProtocol.findMany({
    where: {
      speciesId: species.id,
      retiredAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ minAgeDays: "asc" }, { name: "asc" }],
    select: { name: true, minAgeDays: true, maxAgeDays: true },
  });
  const from = range.minAgeDays ?? 0;
  const to = range.maxAgeDays ?? Infinity;
  const clash = others.find(
    (other) => from < (other.maxAgeDays ?? Infinity) && (other.minAgeDays ?? 0) < to,
  );
  if (clash) {
    throw new MedicalProtocolRefusal(
      `${clash.name} already covers ${speciesPlural(species.name)} ${coveredAgesText(clash.minAgeDays, clash.maxAgeDays)}.`,
      "minAgeDays",
    );
  }
};

/**
 * That a catalog step's item can be scheduled for the protocol's species: of
 * the step's kind, not retired, and for every species or this one. The item
 * is locked against catalog changes until commit, as an entry locks its own.
 */
const checkStepItem = async (
  tx: TransactionClient,
  step: StepCare,
  index: number,
  species: { id: string; name: string },
) => {
  if (!step.itemId) return;
  const field = `steps.${index}.itemId`;
  await lockMedicalItemForUse(tx, step.itemId);
  const item = await tx.medicalItem.findUnique({
    where: { id: step.itemId },
    select: { name: true, kind: true, retiredAt: true },
  });
  if (!item) {
    throw new MedicalProtocolRefusal("That catalog item no longer exists.", field);
  }
  if (item.kind !== step.kind) {
    throw new MedicalProtocolRefusal(
      `${item.name} is a ${KIND_NOUN[item.kind]}, not a ${KIND_NOUN[step.kind]}.`,
      field,
    );
  }
  if (item.retiredAt) {
    throw new MedicalProtocolRefusal(
      `${item.name} has been retired from the catalog.`,
      field,
    );
  }
  const itemSpecies = await tx.species.findMany({
    where: { medicalItems: { some: { id: step.itemId } } },
    select: { id: true },
  });
  if (itemSpecies.length > 0 && !itemSpecies.some((row) => row.id === species.id)) {
    throw new MedicalProtocolRefusal(
      `${item.name} isn't for ${speciesPlural(species.name)}.`,
      field,
    );
  }
};

/** The unique index on the name, reached by a write that raced the check. */
const rethrowDuplicate = (error: unknown, name: string): never => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new MedicalProtocolRefusal(duplicateMessage(name, false), "name");
  }
  throw error;
};

const stepData = (step: StepCare, sortOrder: number) => ({
  kind: step.kind,
  itemId: step.itemId,
  examType: step.examType,
  offsetDays: step.offsetDays,
  notBeforeAgeDays: step.notBeforeAgeDays,
  repeatIntervalDays: step.repeatIntervalDays,
  repeatCount: step.repeatCount,
  untilAgeDays: step.untilAgeDays,
  notes: step.notes,
  sortOrder,
});

const STEP_CARE_FIELDS = [
  "kind",
  "itemId",
  "examType",
  "offsetDays",
  "notBeforeAgeDays",
  "repeatIntervalDays",
  "repeatCount",
  "untilAgeDays",
  "notes",
] as const satisfies readonly (keyof StepCare)[];

const sameCare = (a: StepCare, b: StepCare) =>
  STEP_CARE_FIELDS.every((field) => a[field] === b[field]);

export interface SavedMedicalProtocol {
  id: string;
  /** The live steps' ids, in the order given. */
  stepIds: string[];
}

export const createMedicalProtocol = async (
  tx: TransactionClient,
  input: MedicalProtocolInput,
): Promise<SavedMedicalProtocol> => {
  const protocol = normalise(input);
  if (protocol.steps.some((step) => step.id)) {
    throw new MedicalProtocolRefusal("A new protocol has no steps yet.", "steps");
  }
  await refuseDuplicateName(tx, protocol.name);
  const species = await readSpecies(tx, protocol.speciesId);
  await refuseOverlap(tx, species, protocol);
  for (const [index, step] of protocol.steps.entries()) {
    await checkStepItem(tx, step, index, species);
  }

  let id: string;
  try {
    ({ id } = await tx.medicalProtocol.create({
      data: {
        name: protocol.name,
        speciesId: species.id,
        minAgeDays: protocol.minAgeDays,
        maxAgeDays: protocol.maxAgeDays,
      },
      select: { id: true },
    }));
  } catch (error) {
    return rethrowDuplicate(error, protocol.name);
  }
  const stepIds: string[] = [];
  for (const [index, step] of protocol.steps.entries()) {
    const created = await tx.medicalProtocolStep.create({
      data: { protocolId: id, ...stepData(step, index) },
      select: { id: true },
    });
    stepIds.push(created.id);
  }
  return { id, stepIds };
};

/**
 * Saves a protocol's fields and its whole step list. A listed step whose care
 * is unchanged keeps its id and moves to its new place; one that changed is
 * retired and added anew; a live step left out is retired. No step row is
 * ever deleted, and a retired protocol is unretired before it is edited.
 */
export const updateMedicalProtocol = async (
  tx: TransactionClient,
  protocolId: string,
  input: MedicalProtocolInput,
): Promise<SavedMedicalProtocol> => {
  const protocol = normalise(input);

  await lockMedicalProtocol(tx, protocolId);
  const current = await tx.medicalProtocol.findUnique({
    where: { id: protocolId },
    select: { speciesId: true, retiredAt: true },
  });
  if (!current) {
    throw new NotFoundError("Protocol not found.");
  }
  if (current.retiredAt) {
    throw new ConflictError("This protocol is retired. Unretire it to edit it.");
  }
  const liveSteps = await tx.medicalProtocolStep.findMany({
    where: { protocolId, retiredAt: null },
    select: {
      id: true,
      kind: true,
      itemId: true,
      examType: true,
      offsetDays: true,
      notBeforeAgeDays: true,
      repeatIntervalDays: true,
      repeatCount: true,
      untilAgeDays: true,
      notes: true,
    },
  });
  const liveById = new Map(liveSteps.map((step) => [step.id, step]));
  for (const step of protocol.steps) {
    if (step.id && !liveById.has(step.id)) {
      throw new MedicalProtocolRefusal(
        "One of the steps isn't a live step of this protocol.",
        "steps",
      );
    }
  }

  await refuseDuplicateName(tx, protocol.name, protocolId);
  const species = await readSpecies(tx, protocol.speciesId);
  await refuseOverlap(tx, species, protocol, protocolId);

  // What each listed step becomes: kept as it is, or written anew.
  const speciesChanged = species.id !== current.speciesId;
  const plan = protocol.steps.map((step) => {
    const stored = step.id ? liveById.get(step.id) : undefined;
    return { step, keepId: stored && sameCare(stored, step) ? stored.id : null };
  });
  for (const [index, { step, keepId }] of plan.entries()) {
    // A kept step's item was checked when it was saved; it is checked again
    // only when the protocol moves to another species.
    if (!keepId || speciesChanged) {
      await checkStepItem(tx, step, index, species);
    }
  }

  try {
    await tx.medicalProtocol.update({
      where: { id: protocolId },
      data: {
        name: protocol.name,
        speciesId: species.id,
        minAgeDays: protocol.minAgeDays,
        maxAgeDays: protocol.maxAgeDays,
      },
    });
  } catch (error) {
    rethrowDuplicate(error, protocol.name);
  }

  const keptIds = plan.flatMap(({ keepId }) => (keepId ? [keepId] : []));
  await tx.medicalProtocolStep.updateMany({
    where: { protocolId, retiredAt: null, id: { notIn: keptIds } },
    data: { retiredAt: new Date() },
  });
  const stepIds: string[] = [];
  for (const [index, { step, keepId }] of plan.entries()) {
    if (keepId) {
      await tx.medicalProtocolStep.update({
        where: { id: keepId },
        data: { sortOrder: index },
      });
      stepIds.push(keepId);
    } else {
      const created = await tx.medicalProtocolStep.create({
        data: { protocolId, ...stepData(step, index) },
        select: { id: true },
      });
      stepIds.push(created.id);
    }
  }
  return { id: protocolId, stepIds };
};

export const retireMedicalProtocol = async (
  tx: TransactionClient,
  protocolId: string,
): Promise<void> => {
  await lockMedicalProtocol(tx, protocolId);
  const protocol = await tx.medicalProtocol.findUnique({
    where: { id: protocolId },
    select: { retiredAt: true },
  });
  if (!protocol) {
    throw new NotFoundError("Protocol not found.");
  }
  if (protocol.retiredAt) {
    throw new ConflictError("This protocol is already retired.");
  }
  await tx.medicalProtocol.update({
    where: { id: protocolId },
    data: { retiredAt: new Date() },
  });
};

/** Brings a protocol back, if no live protocol of its species covers its ages since. */
export const unretireMedicalProtocol = async (
  tx: TransactionClient,
  protocolId: string,
): Promise<void> => {
  await lockMedicalProtocol(tx, protocolId);
  const protocol = await tx.medicalProtocol.findUnique({
    where: { id: protocolId },
    select: { retiredAt: true, speciesId: true, minAgeDays: true, maxAgeDays: true },
  });
  if (!protocol) {
    throw new NotFoundError("Protocol not found.");
  }
  if (!protocol.retiredAt) {
    throw new ConflictError("This protocol isn't retired.");
  }
  const species = await readSpecies(tx, protocol.speciesId);
  await refuseOverlap(tx, species, protocol, protocolId);
  await tx.medicalProtocol.update({
    where: { id: protocolId },
    data: { retiredAt: null },
  });
};
