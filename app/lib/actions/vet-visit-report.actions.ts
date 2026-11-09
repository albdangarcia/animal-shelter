"use server";

import { revalidatePath } from "next/cache";
import prisma from "../prisma";
import { RequirePermission, withAuthenticatedUser, type SessionUser } from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { VetVisitReportSchema, type VetVisitReportFormInput } from "../zod-schemas/vet-visit-report.schemas";
import { submitVetVisitReport as submit, reviewVetVisitReport as review, dismissVetVisitReport as dismiss } from "../services/vet-visit-report";
import { MedicalEntryRefusal } from "../services/medical-entry-values";
import { PreconditionFailedError, ConflictError, NotFoundError } from "../utils/errors";
import { getShelterNow } from "../data/shelter-settings.data";
import { fieldErrorsByPath } from "../utils/form-result-utils";
import type { FormResult, FieldErrors } from "../action-result";

function revalidateReports(animalId: string) {
  revalidatePath(`/medical-outputs/animals/${animalId}/history`);
  revalidatePath(`/dashboard/animals/${animalId}/medical`);
  revalidatePath(`/dashboard/animals/${animalId}/medical/documents`);
  revalidatePath("/dashboard/medical/due");
  revalidatePath("/dashboard/my-foster-animals");
  revalidatePath(`/dashboard/my-foster-animals/${animalId}`);
}
function refusal<T>(error: unknown): FormResult<T> {
  if (error instanceof MedicalEntryRefusal && error.field) return { ok: false, message: error.message, fieldErrors: { [error.field]: [error.message] } as FieldErrors<T> };
  if (error instanceof PreconditionFailedError || error instanceof ConflictError || error instanceof NotFoundError) return { ok: false, message: error.message };
  console.error("Failed to save vet visit report:", error);
  return { ok: false, message: "Could not save the report. Please try again." };
}
export const submitVetVisitReport = withAuthenticatedUser(RequirePermission(AppPermissions.MY_FOSTER_ANIMALS_CARE)(async (user: SessionUser, animalId: string, values: VetVisitReportFormInput): Promise<FormResult<VetVisitReportFormInput, { reportId: string }>> => {
  const id = cuidSchema.safeParse(animalId);
  if (!id.success) return { ok: false, message: "Invalid animal ID." };
  const parsed = VetVisitReportSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Missing or invalid fields. The report was not sent.", fieldErrors: fieldErrorsByPath(parsed.error.issues) };
  const { today } = await getShelterNow();
  try {
    const result = await prisma.$transaction((tx) => submit(tx, { ...parsed.data, animalId: id.data }, user.personId, today));
    revalidateReports(result.animalId);
    return { ok: true, message: "Visit reported. You can now add paperwork.", data: { reportId: result.reportId } };
  } catch (error) { return refusal<VetVisitReportFormInput>(error); }
}));

async function close(user: SessionUser, reportId: string, reason?: string): Promise<FormResult<{ reason: string }>> {
  const id = cuidSchema.safeParse(reportId);
  if (!id.success) return { ok: false, message: "Invalid report ID." };
  try {
    const result = await prisma.$transaction((tx) => reason === undefined ? review(tx, id.data, user.personId) : dismiss(tx, id.data, reason, user.personId));
    revalidateReports(result.animalId);
    return { ok: true, message: reason === undefined ? "Report marked reviewed." : "Report dismissed." };
  } catch (error) { return refusal(error); }
}
export const reviewVetVisitReport = withAuthenticatedUser(RequirePermission(AppPermissions.MEDICAL_MANAGE)(async (user: SessionUser, id: string) => close(user, id)));
export const dismissVetVisitReport = withAuthenticatedUser(RequirePermission(AppPermissions.MEDICAL_MANAGE)(async (user: SessionUser, id: string, reason: string) => close(user, id, reason)));
