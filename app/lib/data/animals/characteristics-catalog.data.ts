import { prisma } from "@/app/lib/prisma";
import { Characteristic } from "@prisma/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";

const _fetchCharacteristicsCatalog = async (): Promise<Characteristic[]> => {
  try {
    // Management view: return everything, including soft-deleted rows
    return await prisma.characteristic.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  } catch (error) {
    console.error("Failed to fetch characteristics catalog:", error);
    throw new Error("Could not fetch characteristics.");
  }
};

export const fetchCharacteristicsCatalog = RequirePermission(
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
)(_fetchCharacteristicsCatalog);