import { MedicalEntrySource } from "@/prisma/generated/enums";
import { calendarDay, type CalendarDay } from "./shelter-day";

export const vetReportHref = (animalId: string, reportId: string) => `/dashboard/animals/${animalId}/medical/documents#vet-report-${reportId}`;

/** Only the report's recording context goes to an entry form. */
export interface ReportEntryContext {
  id: string;
  visitDate: string;
  vetPartnerId: string | null;
  vetName: string | null;
}
export function reportCareDefaults(report?: ReportEntryContext): Partial<{
  completedDate: CalendarDay; dateUnknown: boolean; source: MedicalEntrySource; vetPartnerId: string | null; vetName: string;
}> {
  return report ? { completedDate: calendarDay(report.visitDate), dateUnknown: false, source: MedicalEntrySource.OUTSIDE_VET, vetPartnerId: report.vetPartnerId, vetName: report.vetName ?? "" } : {};
}
