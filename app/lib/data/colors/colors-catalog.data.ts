import prisma from "@/app/lib/prisma";
import { ColorModel } from "@/prisma/generated/models/Color";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

const _fetchColorsCatalog = async (): Promise<ColorModel[]> => {
  try {
    // Management view: include soft-deleted rows so admins can restore.
    return await prisma.color.findMany({
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Failed to fetch colors catalog:", error);
    throw new Error("Could not fetch colors.");
  }
};

export const fetchColorsCatalog = RequirePermission(
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
)(_fetchColorsCatalog);