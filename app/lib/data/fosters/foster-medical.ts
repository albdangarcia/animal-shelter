import type prisma from "@/app/lib/prisma";
import { findOpenPlacement } from "./foster-access";
import { findAnimalMedications } from "../animals/medication";
import { orderDays, orderSummary } from "../animals/medication-view";
import { findAnimalDocuments } from "../animals/medical-document";
import { FOSTER_DOSE_PAST_DAYS } from "@/app/lib/constants/medical";
import {
  calendarDay,
  shelterDayKey,
  shiftDayKey,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import { resolveShelterSettings } from "@/app/lib/utils/shelter-settings";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";

/** A foster's limited medical record. Project every result before returning:
 * no staff identity, change history or voided row reaches this page's props.
 * Root client only: document reads select sibling relations. */
export async function findFosterMedical(
  db: typeof prisma,
  personId: string,
  animalId: string,
  clock: ShelterClock,
) {
  const placement = await findOpenPlacement(db, personId, animalId);
  if (!placement) return null;
  const today = clock.day;
  const animal = await db.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: { name: true, birthDate: true },
  });
  const settings = resolveShelterSettings(
    await db.shelterSettings.findUnique({ where: { id: "shelter" } }),
  );
  const alerts = await db.medicalCondition.findMany({
    where: { animalId, voidedAt: null, status: { in: ["ACTIVE", "CHRONIC"] } },
    orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, type: true, name: true, notes: true },
  });
  const due = await db.medicalEntry.findMany({
    where: { animalId, status: "SCHEDULED", voidedAt: null },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      dueDate: true,
      notes: true,
      procedure: true,
      examType: true,
      item: { select: { name: true } },
    },
  });
  const since = shiftDayKey(today, -FOSTER_DOSE_PAST_DAYS);
  const from = placement.startDate > since ? placement.startDate : since;
  const medications = await findAnimalMedications(db, animalId, {
    fromDay: from,
    toDay: today,
  });
  // Use the slot rules shared with staff, but strip voided doses before the
  // view is built, and replace attribution before anything is serialized.
  const names = Object.fromEntries(
    Object.keys(medications.names).map((id) => [
      id,
      id === personId ? "You" : "The shelter",
    ]),
  );
  const orders = medications.orders.flatMap((order) => {
    const summary = orderSummary(order, today);
    if (summary.state !== "ACTIVE") return [];
    const safeOrder = {
      ...order,
      doses: order.doses
        .filter((dose) => !dose.voided)
        .map((dose) => ({ ...dose, reportedByFoster: false })),
    };
    return [
      {
        id: order.id,
        line: summary.line,
        instructions: order.instructions,
        days: orderDays(
          safeOrder,
          from,
          today,
          { today, clock, ends: settings.doseSlotEnds, timezone: settings.timezone, names },
          { idleDays: true },
        ),
      },
    ];
  });
  const given = await db.medicalEntry.findMany({
    where: { animalId, kind: { in: ["VACCINE", "TEST"] }, status: "COMPLETED", voidedAt: null },
    orderBy: [{ completedDate: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: {
      id: true,
      kind: true,
      completedDate: true,
      source: true,
      item: { select: { name: true } },
    },
  });
  const results = await db.testAnalyteResult.findMany({
    where: {
      testDetails: {
        entryId: {
          in: given.filter((entry) => entry.kind === "TEST").map((entry) => entry.id),
        },
      },
    },
    select: { testDetails: { select: { entryId: true } }, analyteName: true, result: true },
    orderBy: [{ analyteName: "asc" }, { id: "asc" }],
  });
  const documents = await findAnimalDocuments(db, animalId, { includeVoided: false });
  const vetClinics = await db.partner.findMany({ where: { type: "VET_CLINIC", isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
  const reports = await db.vetVisitReport.findMany({
    where: { animalId, reportedById: personId },
    orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    select: { id: true, visitDate: true, summary: true, vetName: true, vetPartner: { select: { name: true } }, reviewedAt: true, dismissReason: true, documents: { where: { voidedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, fileRemovedAt: true } } },
  });
  return {
    birthDate: calendarDay(animal.birthDate),
    vetClinics,
    reports: reports.map(({ reviewedAt, ...report }) => ({ ...report, reviewedDate: reviewedAt ? shelterDayKey(reviewedAt, settings.timezone) : null })),
    animalId,
    animalName: animal.name,
    placementStart: placement.startDate,
    today,
    time: clock.time,
    alerts,
    due: due.map((entry) => ({
      id: entry.id,
      name: medicalEntryName(entry),
      dueDate: calendarDay(entry.dueDate!),
      notes: entry.notes,
      recordable: entry.kind === "TREATMENT",
    })),
    orders,
    given: given.map((entry) => ({
      id: entry.id,
      name: medicalEntryName(entry),
      completedDate: entry.completedDate,
      source: entry.source === "OUTSIDE_VET" ? "Outside vet" : "Shelter",
      results: results
        .filter((result) => result.testDetails.entryId === entry.id)
        .map(({ analyteName, result }) => ({ analyteName, result })),
    })),
    documents: documents.map(({ id, name, type, documentDate, notes, fileHeld }) => ({
      id, name, type, documentDate, notes, fileHeld,
    })),
  };
}

export type FosterMedical = NonNullable<Awaited<ReturnType<typeof findFosterMedical>>>;
