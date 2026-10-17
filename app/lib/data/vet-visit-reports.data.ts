import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { findAnimalVetVisitReports, findWaitingVetVisitReports } from "./vet-visit-reports";
import { findDueMedicalEntries } from "./animals/medical-entry";

export const fetchAnimalVetVisitReports = RequirePermission(AppPermissions.MEDICAL_READ)(async (animalId: string) => {
  const id = cuidSchema.parse(animalId);
  return findAnimalVetVisitReports(prisma, id);
});
export const fetchWaitingVetVisitReports = RequirePermission(AppPermissions.MEDICAL_READ)(async () => findWaitingVetVisitReports(prisma));
export const fetchReportScheduledCare = RequirePermission(AppPermissions.MEDICAL_MANAGE)(async (animalId: string) => findDueMedicalEntries(prisma, cuidSchema.parse(animalId)));
