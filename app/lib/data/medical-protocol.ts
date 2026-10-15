// The medical protocol reads with no auth or `next/*` imports, so database
// tests can call them. `medical-protocol.data.ts` wraps them behind their
// permissions.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { MedicalItemKind } from "@/prisma/generated/enums";
import type {
  ProtocolPlanProtocol,
  ProtocolPlanStep,
} from "@/app/lib/utils/medical-protocol-plan";

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

const findIntakeProtocolRows = (db: Db) =>
  db.medicalProtocol.findMany({
    where: { retiredAt: null },
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
 * intake forms preview for the animal being admitted.
 */
export const findIntakeProtocols = async (
  db: Db,
): Promise<ProtocolPlanProtocol[]> =>
  (await findIntakeProtocolRows(db)).map(({ steps, ...protocol }) => ({
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
