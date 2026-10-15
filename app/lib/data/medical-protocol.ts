// The medical protocol reads with no auth or `next/*` imports, so database
// tests can call them. `medical-protocol.data.ts` wraps them behind their
// permissions.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  MedicalEntryKind,
  MedicalEntryStatus,
  MedicalItemKind,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import type {
  ProtocolPlanProtocol,
  ProtocolPlanStep,
  ProtocolRecordFacts,
} from "@/app/lib/utils/medical-protocol-plan";
import {
  CURRENT_CHIP_WHERE,
  findSpayNeuterEntries,
} from "@/app/lib/data/animals/medical-status";

type Db = TransactionClient | typeof prisma;

/** A live step with its item as it is now: retired or narrowed since, or not. */
const PROTOCOL_STEP_SELECT = {
  id: true,
  kind: true,
  examType: true,
  offsetDays: true,
  notBeforeAgeDays: true,
  repeatIntervalDays: true,
  repeatCount: true,
  untilAgeDays: true,
  notes: true,
  sortOrder: true,
  item: {
    select: {
      id: true,
      name: true,
      retiredAt: true,
      species: { select: { id: true } },
    },
  },
} as const;

const LIVE_STEPS = {
  where: { retiredAt: null },
  orderBy: { sortOrder: "asc" },
  select: PROTOCOL_STEP_SELECT,
} as const;

type StepRow = Awaited<
  ReturnType<typeof findIntakeProtocolRows>
>[number]["steps"][number];

const toPlanStep = ({ item, ...step }: StepRow): ProtocolPlanStep => ({
  ...step,
  item: item
    ? {
        id: item.id,
        name: item.name,
        retired: item.retiredAt !== null,
        speciesIds: item.species.map((species) => species.id),
      }
    : null,
});

/**
 * Every protocol, retired ones included, with its live steps in order, for
 * the settings page: grouped by species name, then youngest first. A step's
 * item carries its retired state and species, so the page can flag a step
 * that won't be scheduled any more.
 *
 * The root client only: a protocol's species and steps are sibling relations,
 * which Prisma fetches at once.
 */
export const findMedicalProtocols = async (db: typeof prisma) => {
  const rows = await db.medicalProtocol.findMany({
    orderBy: [
      { species: { name: "asc" } },
      { minAgeDays: { sort: "asc", nulls: "first" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      minAgeDays: true,
      maxAgeDays: true,
      retiredAt: true,
      species: { select: { id: true, name: true } },
      steps: LIVE_STEPS,
    },
  });
  return rows.map(({ species, retiredAt, steps, ...protocol }) => ({
    ...protocol,
    speciesId: species.id,
    speciesName: species.name,
    retired: retiredAt !== null,
    steps: steps.map(toPlanStep),
  }));
};

export type MedicalProtocolListing = Awaited<
  ReturnType<typeof findMedicalProtocols>
>[number];

const findIntakeProtocolRows = (db: Db, speciesId?: string) =>
  db.medicalProtocol.findMany({
    where: { retiredAt: null, ...(speciesId && { speciesId }) },
    orderBy: [{ speciesId: "asc" }, { minAgeDays: { sort: "asc", nulls: "first" } }],
    select: {
      id: true,
      name: true,
      speciesId: true,
      minAgeDays: true,
      maxAgeDays: true,
      steps: LIVE_STEPS,
    },
  });

/**
 * The live protocols with their live steps, as the plan takes them: what the
 * intake forms preview for the animal being admitted, and what applying one
 * matches against (`speciesId` narrows it to one species).
 */
export const findIntakeProtocols = async (
  db: Db,
  { speciesId }: { speciesId?: string } = {},
): Promise<ProtocolPlanProtocol[]> =>
  (await findIntakeProtocolRows(db, speciesId)).map(({ steps, ...protocol }) => ({
    ...protocol,
    retired: false,
    steps: steps.map(toPlanStep),
  }));

/**
 * The catalog items a protocol step can name: live vaccines, tests and
 * treatments, each with the species it is for (none means every species).
 */
export const findProtocolStepItems = async (db: Db) =>
  (
    await db.medicalItem.findMany({
      where: {
        retiredAt: null,
        kind: {
          in: [MedicalItemKind.VACCINE, MedicalItemKind.TEST, MedicalItemKind.TREATMENT],
        },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        kind: true,
        name: true,
        species: { select: { id: true } },
      },
    })
  ).map(({ species, ...item }) => ({
    ...item,
    speciesIds: species.map((row) => row.id),
  }));

export type ProtocolStepItem = Awaited<
  ReturnType<typeof findProtocolStepItems>
>[number];

/**
 * What the animal's medical record says that a protocol's plan reads: its
 * spay and neuter entries, whether it carries a chip, and the care already
 * open and scheduled for it (a returning animal's leftovers). Read one query
 * after another, so a transaction can call it.
 */
export const findProtocolRecordFacts = async (
  db: Db,
  animalId: string,
): Promise<ProtocolRecordFacts> => {
  const spayNeuterEntries = (await findSpayNeuterEntries(db, [animalId])).get(animalId) ?? [];
  const chip = await db.medicalEntry.findFirst({
    where: { animalId, ...CURRENT_CHIP_WHERE },
    select: { id: true },
  });
  const open = await db.medicalEntry.findMany({
    where: { animalId, status: MedicalEntryStatus.SCHEDULED, voidedAt: null },
    select: { kind: true, itemId: true, procedure: true, examType: true },
  });
  return {
    spayNeuterEntries,
    chipped: chip !== null,
    openScheduled: {
      itemIds: [...new Set(open.flatMap((entry) => entry.itemId ?? []))],
      examTypes: [...new Set(open.flatMap((entry) => entry.examType ?? []))],
      spayNeuter: open.some(
        (entry) =>
          entry.kind === MedicalEntryKind.SURGERY &&
          (entry.procedure === SurgeryProcedure.SPAY ||
            entry.procedure === SurgeryProcedure.NEUTER),
      ),
      microchip: open.some((entry) => entry.kind === MedicalEntryKind.MICROCHIP),
    },
  };
};
