import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { ANIMAL_PLACE_SELECT, placeOf } from "./medical-due";
import { MEDICAL_ENTRY_DISPLAY_SELECT } from "./animals/medical-entry";

const REPORT_SELECT = {
  id: true, animalId: true, visitDate: true, vetPartnerId: true, vetName: true, summary: true,
  reviewedAt: true, dismissReason: true, createdAt: true,
  reportedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { name: true } },
  vetPartner: { select: { name: true } },
  documents: { where: { voidedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, fileRemovedAt: true } },
  entries: { orderBy: [{ completedDate: "asc" }, { id: "asc" }], select: MEDICAL_ENTRY_DISPLAY_SELECT },
} satisfies Prisma.VetVisitReportSelect;

/** Root client only: report display selects sibling relations. */
export async function findAnimalVetVisitReports(db: typeof prisma, animalId: string) {
  return db.vetVisitReport.findMany({ where: { animalId }, orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }, { id: "asc" }], select: REPORT_SELECT });
}
export type VetVisitReportDisplay = Awaited<ReturnType<typeof findAnimalVetVisitReports>>[number];

/** Oldest visits first within each reporting foster, even after their placement ends. */
export async function findWaitingVetVisitReports(db: typeof prisma, animalIds?: string[]) {
  const reports = await db.vetVisitReport.findMany({
    where: { reviewedAt: null, animal: { listingStatus: { not: "ARCHIVED" } }, ...(animalIds && { animalId: { in: animalIds } }) },
    orderBy: [{ visitDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, visitDate: true, summary: true, reportedBy: { select: { id: true, name: true } }, animal: { select: { id: true, name: true, ...ANIMAL_PLACE_SELECT } } },
  });
  const groups = new Map<string, { fosterId: string; fosterName: string; reports: (typeof reports[number] & { place: ReturnType<typeof placeOf> })[] }>();
  for (const report of reports) {
    let group = groups.get(report.reportedBy.id);
    if (!group) {
      group = { fosterId: report.reportedBy.id, fosterName: report.reportedBy.name, reports: [] };
      groups.set(group.fosterId, group);
    }
    group.reports.push({ ...report, place: placeOf(report.animal) });
  }
  // Insertion order is the oldest waiting visit per group, then its name.
  return [...groups.values()].sort((a, b) => a.reports[0].visitDate.localeCompare(b.reports[0].visitDate) || a.fosterName.localeCompare(b.fosterName));
}

