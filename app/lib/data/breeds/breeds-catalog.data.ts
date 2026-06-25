import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

export type BreedWithSpecies = Prisma.BreedGetPayload<{
  include: { species: { select: { id: true; name: true } } };
}>;

const _fetchBreedsCatalog = async (): Promise<BreedWithSpecies[]> => {
  try {
    // Management view: include soft-deleted rows so admins can restore.
    return await prisma.breed.findMany({
      include: { species: { select: { id: true, name: true } } },
      orderBy: [{ species: { name: "asc" } }, { name: "asc" }],
    });
  } catch (error) {
    console.error("Failed to fetch breeds catalog:", error);
    throw new Error("Could not fetch breeds.");
  }
};

export const fetchBreedsCatalog = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_fetchBreedsCatalog);