import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { checkFostering } from "@/app/lib/data/fosters/foster-access";
import { checkVetClinic } from "./medical-entry";
import { MedicalEntryRefusal, tidy } from "./medical-entry-values";
import { waitingVetVisitReport } from "./vet-visit-report-values";
import { NotFoundError } from "@/app/lib/utils/errors";
import { calendarDay, formatShelterDayOrNA, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { VET_VISIT_SUMMARY_MAX_LENGTH, MEDICAL_REASON_MAX_LENGTH, OUTSIDE_VET_NEEDS_VET, VET_VISIT_ONE_VET } from "@/app/lib/constants/medical";

export interface VetVisitReportInput {
  animalId: string;
  visitDate: CalendarDay;
  vetPartnerId?: string | null;
  vetName?: string | null;
  summary: string;
}

/** Auth-free writes. The caller authorizes; all state checks follow the animal lock. */
export async function submitVetVisitReport(tx: TransactionClient, input: VetVisitReportInput, personId: string, today: CalendarDay) {
  await lockAnimal(tx, input.animalId);
  const placement = await checkFostering(tx, personId, input.animalId);
  const visitDate = calendarDay(input.visitDate);
  if (visitDate < placement.startDate) throw new MedicalEntryRefusal("The visit date can't be before this animal was placed with you.", "visitDate");
  if (visitDate > today) throw new MedicalEntryRefusal("The visit date can't be in the future.", "visitDate");
  const vetPartnerId = tidy(input.vetPartnerId);
  const vetName = tidy(input.vetName);
  if (!vetPartnerId && !vetName) throw new MedicalEntryRefusal(OUTSIDE_VET_NEEDS_VET, "vetName");
  if (vetPartnerId && vetName) throw new MedicalEntryRefusal(VET_VISIT_ONE_VET, "vetName");
  if (vetName && vetName.length > 120) throw new MedicalEntryRefusal("The vet's name must be 120 characters or fewer.", "vetName");
  if (vetPartnerId) await checkVetClinic(tx, vetPartnerId, "vetPartnerId");
  const summary = tidy(input.summary);
  if (!summary) throw new MedicalEntryRefusal("Say what happened at the visit.", "summary");
  if (summary.length > VET_VISIT_SUMMARY_MAX_LENGTH) throw new MedicalEntryRefusal(`Must be ${VET_VISIT_SUMMARY_MAX_LENGTH} characters or fewer.`, "summary");
  const report = await tx.vetVisitReport.create({ data: { animalId: input.animalId, placementId: placement.id, reportedById: personId, visitDate, vetPartnerId, vetName, summary }, select: { id: true, animalId: true } });
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, select: { name: true } });
  const clinic = vetPartnerId ? await tx.partner.findUniqueOrThrow({ where: { id: vetPartnerId }, select: { name: true } }) : null;
  await tx.animalActivityLog.create({ data: { animalId: report.animalId, changedById: personId, activityType: "VET_VISIT_REPORTED", changeSummary: `${person.name} reported an outside vet visit on ${formatShelterDayOrNA(visitDate)} at ${clinic?.name ?? vetName}.` } });
  return { reportId: report.id, animalId: report.animalId };
}

async function closeReport(tx: TransactionClient, id: string, actorId: string, reason: string | null) {
  const located = await tx.vetVisitReport.findUnique({ where: { id }, select: { animalId: true } });
  if (!located) throw new NotFoundError("Vet visit report not found.");
  await lockAnimal(tx, located.animalId);
  const report = await waitingVetVisitReport(tx, id, located.animalId);
  const count = await tx.medicalEntry.count({ where: { vetReportId: id } });
  await tx.vetVisitReport.update({ where: { id }, data: { reviewedAt: new Date(), reviewedById: actorId, dismissReason: reason } });
  await tx.animalActivityLog.create({ data: {
    animalId: report.animalId, changedById: actorId,
    activityType: reason ? "VET_VISIT_REPORT_DISMISSED" : "VET_VISIT_REPORT_REVIEWED",
    changeSummary: `The foster's report of the visit on ${formatShelterDayOrNA(report.visitDate)} ${reason ? `was dismissed. Reason: ${reason}` : `was marked reviewed: ${count} ${count === 1 ? "entry" : "entries"} recorded from it.`}`,
  } });
  return { reportId: id, animalId: report.animalId };
}

export async function reviewVetVisitReport(tx: TransactionClient, id: string, actorId: string) {
  return closeReport(tx, id, actorId, null);
}

export async function dismissVetVisitReport(tx: TransactionClient, id: string, reasonInput: string, actorId: string) {
  const reason = tidy(reasonInput);
  if (!reason) throw new MedicalEntryRefusal("Say why this report is being dismissed.", "reason");
  if (reason.length > MEDICAL_REASON_MAX_LENGTH) throw new MedicalEntryRefusal(`Must be ${MEDICAL_REASON_MAX_LENGTH} characters or fewer.`, "reason");
  return closeReport(tx, id, actorId, reason);
}
