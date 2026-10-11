// The catalog reads with no auth or `next/*` imports, so database tests can
// call them. `medical-catalog.data.ts` wraps them behind their permissions.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { MedicalItemKind } from "@/prisma/generated/enums";

type Db = TransactionClient | typeof prisma;

export const PICKABLE_MEDICAL_ITEM_SELECT = {
  id: true,
  kind: true,
  name: true,
  manufacturer: true,
  defaultRoute: true,
  defaultDoseAmount: true,
  defaultDoseUnit: true,
  isRabies: true,
  repeatIntervalDays: true,
  analytes: {
    where: { retiredAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  },
} as const;

/**
 * The items staff can pick when recording care of `kind` on one animal: not
 * retired, of that kind, and for every species or the animal's own. Each
 * carries its defaults, its repeat interval and, for a test, the analytes it
 * reports, in order.
 */
export const findPickableMedicalItems = (
  db: Db,
  animalSpeciesId: string,
  kind: MedicalItemKind,
) =>
  db.medicalItem.findMany({
    where: {
      kind,
      retiredAt: null,
      OR: [
        { species: { none: {} } },
        { species: { some: { id: animalSpeciesId } } },
      ],
    },
    orderBy: { name: "asc" },
    select: PICKABLE_MEDICAL_ITEM_SELECT,
  });

export type PickableMedicalItem = Awaited<
  ReturnType<typeof findPickableMedicalItems>
>[number];

/** Every item, retired ones included, for the settings page. */
export const findMedicalCatalog = (db: Db) =>
  db.medicalItem.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      id: true,
      kind: true,
      name: true,
      manufacturer: true,
      defaultRoute: true,
      defaultDoseAmount: true,
      defaultDoseUnit: true,
      repeatIntervalDays: true,
      isRabies: true,
      retiredAt: true,
      species: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      analytes: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, retiredAt: true },
      },
      _count: { select: { entries: true } },
    },
  });

export type MedicalCatalogItem = Awaited<
  ReturnType<typeof findMedicalCatalog>
>[number];
