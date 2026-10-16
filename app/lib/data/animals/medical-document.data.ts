import prisma from "@/app/lib/prisma";
import { z } from "zod";
import { MedicalDocumentType } from "@/prisma/generated/enums";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { findAnimalDocuments, type MedicalDocumentDisplay } from "./medical-document";

export type { MedicalDocumentDisplay } from "./medical-document";

const parseAnimalId = (animalId: string) => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) {
    throw new Error("Invalid animal ID format.");
  }
  return parsed.data;
};

// The URL's type filter: one type, or none for every type. A list (the URL
// repeating `type`) reads its first; anything else shows every type.
const typeParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value))
  .pipe(z.enum(MedicalDocumentType).optional().catch(undefined));

export interface AnimalDocuments {
  /** Newest upload first, voided ones included. */
  documents: MedicalDocumentDisplay[];
  /** The type the list is filtered to, if any. */
  type: MedicalDocumentType | null;
}

const _fetchAnimalDocuments = async (
  animalId: string,
  typeInput?: string | string[],
): Promise<AnimalDocuments> => {
  const id = parseAnimalId(animalId);
  const type = typeParam.parse(typeInput);
  try {
    return {
      documents: await findAnimalDocuments(prisma, id, { type, includeVoided: true }),
      type: type ?? null,
    };
  } catch (error) {
    console.error("Failed to fetch the animal's medical documents:", error);
    throw new Error("Could not fetch the medical documents.");
  }
};

export const fetchAnimalDocuments = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchAnimalDocuments);
