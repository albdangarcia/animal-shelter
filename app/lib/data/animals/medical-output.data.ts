import { notFound } from "next/navigation";
import prisma from "@/app/lib/prisma";
import { getCachedSession } from "../../auth/session";
import { can } from "../../auth/can";
import { AppPermissions } from "../../auth/permissions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { getShelterNow } from "../shelter-settings.data";
import { findMedicalHistoryOutput } from "./medical-output";

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
