import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { hasPermission } from "../auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { MedicalItemKind, PartnerType } from "@/prisma/generated/enums";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { getShelterToday } from "./shelter-settings.data";
import {
  findMedicalCatalog,
  findPickableMedicalItems,
  type MedicalCatalogItem,
  type PickableMedicalItem,
} from "./medical-catalog";
import type { CalendarDay } from "../utils/shelter-day";

export type { MedicalCatalogItem, PickableMedicalItem } from "./medical-catalog";

const _fetchMedicalCatalog = async (): Promise<MedicalCatalogItem[]> => {
  try {
    // Management view: retired items included, so admins can unretire them.
    return await findMedicalCatalog(prisma);
  } catch (error) {
    console.error("Failed to fetch medical catalog:", error);
    throw new Error("Could not fetch the medical catalog.");
  }
};

export const fetchMedicalCatalog = RequirePermission(
  AppPermissions.MEDICAL_SETTINGS_MANAGE,
)(_fetchMedicalCatalog);

// The species an item can be limited to. Live species only: a retired one
// already on an item still shows on that item.
const _fetchMedicalCatalogSpecies = async () => {
  try {
    return await prisma.species.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch (error) {
    console.error("Failed to fetch species for the medical catalog:", error);
    throw new Error("Could not fetch species.");
  }
};

export const fetchMedicalCatalogSpecies = RequirePermission(
  AppPermissions.MEDICAL_SETTINGS_MANAGE,
)(_fetchMedicalCatalogSpecies);

export interface MedicalEntryFormOptions {
  /** The items staff can pick for this animal, every kind. */
  items: PickableMedicalItem[];
  /** Active vet clinic partners. */
  vetClinics: { id: string; name: string }[];
  /** The shelter's today: the date given starts there, and can't pass it. */
  today: CalendarDay;
}

// What the entry forms offer for one animal. Behind MEDICAL_MANAGE, not the
// catalog's admin permission: staff recording care read the catalog, they
// don't manage it.
const _fetchMedicalEntryFormOptions = async (
  animalId: string,
): Promise<MedicalEntryFormOptions> => {
  const id = cuidSchema.safeParse(animalId);
  if (!id.success) {
    throw new Error("Invalid animal ID format.");
  }
  try {
    const animal = await prisma.animal.findUniqueOrThrow({
      where: { id: id.data },
      select: { speciesId: true },
    });
    const [items, vetClinics, today] = await Promise.all([
      Promise.all(
        Object.values(MedicalItemKind).map((kind) =>
          findPickableMedicalItems(prisma, animal.speciesId, kind),
        ),
      ),
      prisma.partner.findMany({
        where: { type: PartnerType.VET_CLINIC, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getShelterToday(),
    ]);
    return { items: items.flat(), vetClinics, today };
  } catch (error) {
    console.error("Failed to fetch medical entry form options:", error);
    throw new Error("Could not fetch the medical entry form options.");
  }
};

export const fetchMedicalEntryFormOptions = RequirePermission(
  AppPermissions.MEDICAL_MANAGE,
)(_fetchMedicalEntryFormOptions);

/**
 * For a Medical page: the entry forms' options when the viewer may record and
 * correct care, and null when they may only read.
 */
export const fetchMedicalManage = async (
  animalId: string,
): Promise<{ animalId: string; options: MedicalEntryFormOptions } | null> =>
  (await hasPermission(AppPermissions.MEDICAL_MANAGE))
    ? { animalId, options: await fetchMedicalEntryFormOptions(animalId) }
    : null;
