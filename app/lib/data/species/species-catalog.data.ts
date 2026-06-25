import { prisma } from "@/app/lib/prisma";
import { Species } from "@prisma/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

const _fetchSpeciesCatalog = async (): Promise<Species[]> => {
  try {
    // Include soft-deleted rows so admins can restore.
    return await prisma.species.findMany({
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Failed to fetch species catalog:", error);
    throw new Error("Could not fetch species.");
  }
};

export const fetchSpeciesCatalog = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_fetchSpeciesCatalog);