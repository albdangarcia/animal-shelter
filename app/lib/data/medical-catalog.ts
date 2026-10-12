// The catalog reads with no auth or `next/*` imports, so database tests can
// call them. `medical-catalog.data.ts` wraps them behind their permissions.

import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { MedicalItemKind } from "@/prisma/generated/enums";
import { findOpenScheduledEntryIdsByItem } from "./animals/medical-entry";

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

/**
 * An item as the entry forms offer it. `scheduledEntryIds` are the animal's
 * open scheduled entries for it: when there is one besides the care being
 * recorded, the next dose is already planned, so recording doesn't offer to
 * schedule it.
 */
export type MedicalEntryFormItem = PickableMedicalItem & {
  scheduledEntryIds: string[];
};

/**
 * The items the entry forms offer for one animal. `items` are the pickable
 * ones, every kind. `scheduledItems` are the items of its open scheduled care
 * that can't be picked for new entries any more (retired, or narrowed to
 * other species): that care is still recorded with its own item.
 */
export const findMedicalEntryFormItems = async (
  db: Db,
  animal: { id: string; speciesId: string },
): Promise<{
  items: MedicalEntryFormItem[];
  scheduledItems: MedicalEntryFormItem[];
}> => {
  // One query at a time, so it can run inside a transaction on one client.
  const items: PickableMedicalItem[] = [];
  for (const kind of Object.values(MedicalItemKind)) {
    items.push(...(await findPickableMedicalItems(db, animal.speciesId, kind)));
  }
  const scheduled = await findOpenScheduledEntryIdsByItem(db, animal.id);
  const pickableIds = new Set(items.map((item) => item.id));
  const unpickable = [...scheduled.keys()].filter((id) => !pickableIds.has(id));
  const scheduledItems =
    unpickable.length > 0
      ? await db.medicalItem.findMany({
          where: { id: { in: unpickable } },
          orderBy: { name: "asc" },
          select: PICKABLE_MEDICAL_ITEM_SELECT,
        })
      : [];
  const withEntries = (item: PickableMedicalItem): MedicalEntryFormItem => ({
    ...item,
    scheduledEntryIds: scheduled.get(item.id) ?? [],
  });
  return {
    items: items.map(withEntries),
    scheduledItems: scheduledItems.map(withEntries),
  };
};

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
