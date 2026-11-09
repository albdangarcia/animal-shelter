import type { TransactionClient } from "@/app/lib/prisma";
import { MedicalEntryRefusal } from "./medical-entry-values";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

/** Call after locking the animal, as every report mutation does. */
export async function waitingVetVisitReport(tx: TransactionClient, id: string, animalId: string) {
  const report = await tx.vetVisitReport.findUnique({ where: { id } });
  if (!report) throw new NotFoundError("Vet visit report not found.");
  if (report.animalId !== animalId) throw new MedicalEntryRefusal("That report belongs to another animal.");
  if (report.reviewedAt) throw new ConflictError("That report has already been reviewed or dismissed.");
  return report;
}

/** Provenance for care recorded from a report; a waiting report itself never counts as care. */
export async function reportEntryData(tx: TransactionClient, animalId: string, source: string, vetReportId?: string | null) {
  if (!vetReportId) return {};
  await waitingVetVisitReport(tx, vetReportId, animalId);
  if (source !== "OUTSIDE_VET") throw new MedicalEntryRefusal("Care recorded from a foster's report must have Outside vet as its source.", "source");
  return { vetReportId, reportedByFoster: true };
}
