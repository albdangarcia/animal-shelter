import { notFound } from "next/navigation";
import prisma from "@/app/lib/prisma";
import { getCachedSession } from "../../auth/session";
import { can } from "../../auth/can";
import { AppPermissions } from "../../auth/permissions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { getShelterNow } from "../shelter-settings.data";
import { findMedicalHistoryOutput, findRabiesCertificateOutput } from "./medical-output";

export async function fetchMedicalHistoryOutput(animalId: string) {
  const session = await getCachedSession();
  if (!can(session?.user.role, AppPermissions.MEDICAL_READ)) notFound();
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) notFound();
  const clock = await getShelterNow();
  const output = await findMedicalHistoryOutput(prisma, parsed.data, clock);
  if (!output) notFound();
  return output;
}

export async function fetchRabiesCertificateOutput(animalId: string, entryId: string) {
  const session = await getCachedSession();
  if (!can(session?.user.role, AppPermissions.MEDICAL_READ)) notFound();
  const animal = cuidSchema.safeParse(animalId);
  const entry = cuidSchema.safeParse(entryId);
  if (!animal.success || !entry.success) notFound();
  const clock = await getShelterNow();
  const result = await findRabiesCertificateOutput(prisma, animal.data, entry.data, clock);
  if (!result.available && result.reason === "NOT_FOUND") notFound();
  return { result, canCorrect: can(session?.user.role, AppPermissions.MEDICAL_MANAGE)
    && !result.available && ["DAY_UNKNOWN", "VALIDITY_UNKNOWN", "CREDENTIALS_MISSING"].includes(result.reason) };
}
