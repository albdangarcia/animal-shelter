import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { TransactionClient } from "@/app/lib/prisma";
import { calendarDay, parseCalendarDay, type ShelterNow } from "../../utils/shelter-day";
import { medicalOutputExamLabel, medicalOutputProvenance, rabiesCertificateEligibility, type CompletedMedicalOutput, type MedicalHistoryOutput, type MedicalOutputAnimal, type RabiesCertificateEligibility, type RabiesCertificateOutput } from "../../utils/medical-output";
import { spayNeuterStatus, openExemptionReview } from "../../utils/spay-neuter";
import { latestReproductiveFinding } from "../../utils/exams";
import { rabiesStatus } from "../../utils/medical-days";
import { orderState, slotOrderOf } from "../../utils/medication-slots";
import { SURGERY_PROCEDURE_LABELS } from "../../constants/medical";

// Root scalars only. Details are read sequentially on the transaction's connection.
const ENTRY_SELECT = {
  id: true, kind: true, status: true, itemId: true, procedure: true, examType: true,
  chipNumber: true, completedDate: true, dueDate: true, source: true,
  reportedByFoster: true, vetReportId: true, exemptionReason: true,
  reviewDate: true, updatedAt: true, createdAt: true,
} satisfies Prisma.MedicalEntrySelect;

async function findOutputAnimal(tx: TransactionClient, animalId: string): Promise<MedicalOutputAnimal | null> {
  const animal = await tx.animal.findUnique({ where: { id: animalId }, select: {
    id: true, name: true, birthDate: true, sex: true, speciesId: true, primaryColorId: true,
  } });
  if (!animal) return null;
  const species = await tx.species.findUniqueOrThrow({ where: { id: animal.speciesId }, select: { name: true } });
  const color = await tx.color.findUniqueOrThrow({ where: { id: animal.primaryColorId }, select: { name: true } });
  const breeds = await tx.animal.findUniqueOrThrow({ where: { id: animalId }, select: {
    breeds: { select: { name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] },
  } });
  return { id: animal.id, name: animal.name, species: species.name, breeds: breeds.breeds.map((b) => b.name),
    sex: animal.sex, birthDate: calendarDay(animal.birthDate), primaryColor: color.name };
}

export type RabiesCertificateResult =
  | { available: true; output: RabiesCertificateOutput }
  | Extract<RabiesCertificateEligibility, { available: false }>;

/** Only the explicitly selected entry, read with its identity and details in one snapshot. */
export async function findRabiesCertificateOutput(
  db: typeof prisma,
  animalId: string,
  entryId: string,
  clock: Pick<ShelterNow, "today" | "now" | "clock">,
): Promise<RabiesCertificateResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const entry = await tx.medicalEntry.findFirst({ where: { id: entryId, animalId }, select: {
      id: true, animalId: true, kind: true, status: true, voidedAt: true, outcomeId: true,
      completedDate: true, itemId: true, source: true, reportedByFoster: true, vetReportId: true,
    } });
    const vaccine = entry ? await tx.vaccineDetails.findUnique({ where: { entryId }, select: {
      manufacturer: true, lotNumber: true, lotExpiryDate: true, route: true, site: true,
      rabiesTagNumber: true, durationMonths: true, validUntilDate: true,
      veterinarianName: true, veterinarianLicenseNumber: true,
    } }) : null;
    const certificate = rabiesCertificateEligibility(entry ? {
      ...entry, completedDate: parseCalendarDay(entry.completedDate),
      vaccine: vaccine ? { ...vaccine, validUntilDate: parseCalendarDay(vaccine.validUntilDate) } : null,
    } : null, { animalId, entryId }, clock.today);
    if (!certificate.available) return certificate;
    const animal = await findOutputAnimal(tx, animalId);
    if (!animal) return { available: false, reason: "NOT_FOUND", message: "This vaccination record is unavailable for this animal." };
    const item = entry!.itemId ? await tx.medicalItem.findUnique({ where: { id: entry!.itemId }, select: { name: true } }) : null;
    return { available: true, output: {
      animal, generatedDate: clock.today, generatedTime: clock.clock.time, generatedAt: clock.now, certificate,
      vaccination: { kind: "VACCINE", product: item?.name ?? "Product not recorded",
        completedDate: certificate.completedDate, provenance: medicalOutputProvenance({ ...entry!, source: entry!.source! }),
        manufacturer: vaccine!.manufacturer, lotNumber: vaccine!.lotNumber, lotExpiryDate: parseCalendarDay(vaccine!.lotExpiryDate),
        route: vaccine!.route, site: vaccine!.site, rabiesTagNumber: vaccine!.rabiesTagNumber,
        durationMonths: vaccine!.durationMonths, validUntilDate: certificate.validUntilDate },
    } };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}

/** Full available history, across stays, from one snapshot. No staff DTO or file read. */
export async function findMedicalHistoryOutput(
  db: typeof prisma,
  animalId: string,
  clock: Pick<ShelterNow, "today" | "now" | "clock">,
): Promise<MedicalHistoryOutput | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const animal = await findOutputAnimal(tx, animalId);
    if (!animal) return null;
    const entries = await tx.medicalEntry.findMany({
      where: { animalId, voidedAt: null, outcomeId: null, kind: { notIn: ["EUTHANASIA", "DEATH"] } },
      select: ENTRY_SELECT,
      orderBy: [{ completedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
    });
    const completed = entries.filter((e) => e.status === "COMPLETED");
    const entryIds = completed.map((e) => e.id);
    const detailWhere = { entryId: { in: entryIds } };
    const items = await tx.medicalItem.findMany({ where: { id: { in: entries.flatMap((e) => e.itemId ? [e.itemId] : []) } }, select: { id: true, name: true } });
    const itemNames = new Map(items.map((item) => [item.id, item.name]));
    const vaccines = new Map((await tx.vaccineDetails.findMany({ where: detailWhere, select: {
      entryId: true, manufacturer: true, lotNumber: true, lotExpiryDate: true, route: true,
      site: true, rabiesTagNumber: true, durationMonths: true, validUntilDate: true,
    } })).map((v) => [v.entryId, v]));
    const tests = new Map((await tx.testDetails.findMany({ where: detailWhere, select: {
      entryId: true, results: { select: { analyteName: true, result: true }, orderBy: [{ analyteName: "asc" }, { id: "asc" }] },
    } })).map((v) => [v.entryId, v]));
    const treatments = new Map((await tx.treatmentDetails.findMany({ where: detailWhere, select: {
      entryId: true, doseAmount: true, doseUnit: true, route: true,
    } })).map((v) => [v.entryId, v]));
    const surgeries = new Map((await tx.surgeryDetails.findMany({ where: detailWhere, select: { entryId: true, evidence: true } })).map((v) => [v.entryId, v]));
    const exams = new Map((await tx.examDetails.findMany({ where: detailWhere, select: {
      entryId: true, overallResult: true, reproductiveStatus: true,
      findings: { select: { bodySystem: true, status: true }, orderBy: [{ bodySystem: "asc" }, { id: "asc" }] },
    } })).map((v) => [v.entryId, v]));
    const chips = new Map((await tx.microchipDetails.findMany({ where: detailWhere, select: {
      entryId: true, brand: true, registrationStatus: true, registryName: true, registrationDate: true,
    } })).map((v) => [v.entryId, v]));
    const completedCare: CompletedMedicalOutput[] = completed.flatMap((e): CompletedMedicalOutput[] => {
      const common = { completedDate: parseCalendarDay(e.completedDate), provenance: medicalOutputProvenance({ ...e, source: e.source! }) };
      const product = itemNames.get(e.itemId!) ?? "Product not recorded";
      switch (e.kind) {
        case "VACCINE": {
          const v = vaccines.get(e.id);
          return [{ ...common, kind: e.kind, product, manufacturer: v?.manufacturer ?? null,
            lotNumber: v?.lotNumber ?? null, lotExpiryDate: parseCalendarDay(v?.lotExpiryDate),
            route: v?.route ?? null, site: v?.site ?? null, rabiesTagNumber: v?.rabiesTagNumber ?? null,
            durationMonths: v?.durationMonths ?? null, validUntilDate: parseCalendarDay(v?.validUntilDate) }];
        }
        case "TEST": return [{ ...common, kind: e.kind, product, results: tests.get(e.id)?.results ?? [] }];
        case "TREATMENT": {
          const t = treatments.get(e.id);
          return [{ ...common, kind: e.kind, product, doseAmount: t?.doseAmount ?? null, doseUnit: t?.doseUnit ?? null, route: t?.route ?? null }];
        }
        case "SURGERY": return [{ ...common, kind: e.kind, procedure: e.procedure!, evidence: surgeries.get(e.id)?.evidence ?? null }];
        case "EXAM": {
          const exam = exams.get(e.id)!;
          return [{ ...common, kind: e.kind, examType: e.examType!, overallResult: exam.overallResult, findings: exam.findings }];
        }
        case "MICROCHIP": return [{ ...common, kind: e.kind, chipNumber: e.chipNumber!, brand: chips.get(e.id)?.brand ?? null }];
        default: return [];
      }
    });
    const spayEntries = entries.filter((e) => e.kind === "SURGERY" && (e.procedure === "SPAY" || e.procedure === "NEUTER"))
      .map((e) => ({ ...e, procedure: e.procedure!, declineReason: null }));
    const examFacts = completed.filter((e) => e.kind === "EXAM").map((e) => ({
      entryId: e.id, examType: e.examType!, completedDate: calendarDay(e.completedDate!),
      overallResult: exams.get(e.id)!.overallResult, reproductiveStatus: exams.get(e.id)!.reproductiveStatus, createdAt: e.createdAt,
    }));
    const altered = spayNeuterStatus(spayEntries, clock.today, latestReproductiveFinding(examFacts));
    // Deliberately omit the derivation's internal entry identifiers.
    const safeAltered: MedicalHistoryOutput["summary"]["altered"] = altered.status === "ALTERED"
      ? { status: altered.status, procedure: altered.procedure, completedDate: altered.completedDate }
      : altered.status === "EXEMPT" ? { status: altered.status, reason: altered.reason, reviewDate: altered.reviewDate }
      : altered.status === "INTACT" ? { status: altered.status, examDate: altered.examDate, lapsedOn: altered.lapsedOn }
      : { status: altered.status, lapsedOn: altered.lapsedOn };
    const rabies = completed.find((e) => e.kind === "VACCINE" && vaccines.get(e.id)?.durationMonths != null);
    const conditions = await tx.medicalCondition.findMany({ where: { animalId, voidedAt: null }, select: {
      type: true, name: true, status: true, onsetDate: true, resolvedDate: true,
    }, orderBy: [{ onsetDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }] });
    const episodes = await tx.careEpisode.findMany({ where: { animalId, voidedAt: null }, select: {
      type: true, startDate: true, endDate: true,
    }, orderBy: [{ startDate: "desc" }, { id: "desc" }] });
    const orders = await tx.medicationOrder.findMany({ where: { animalId, voidedAt: null }, select: {
      item: { select: { name: true } }, doseAmount: true, doseUnit: true, route: true, frequency: true,
      intervalDays: true, firstSlot: true, startDate: true, endDate: true, discontinuedDate: true, instructions: true,
    }, orderBy: [{ startDate: "desc" }, { id: "desc" }] });
    const documents = await tx.medicalDocument.findMany({ where: {
      animalId, voidedAt: null, fileRemovedAt: null,
      type: { in: ["LAB_RESULT", "VET_RECORD", "IMAGING", "PRESCRIPTION"] },
      OR: [{ entryId: { in: entryIds } }, { entryId: null, vetReportId: null }],
    }, select: { name: true, type: true, documentDate: true },
    orderBy: [{ documentDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }] });
    const review = openExemptionReview(spayEntries);
    const plannedCare = entries.filter((e) => e.status === "SCHEDULED").map((e) => ({
      name: e.itemId ? itemNames.get(e.itemId)! : e.procedure ? SURGERY_PROCEDURE_LABELS[e.procedure]
        : e.examType ? medicalOutputExamLabel(e.examType) : "Microchip",
      dueDate: parseCalendarDay(e.dueDate), overdue: e.dueDate !== null && e.dueDate < clock.today,
    }));
    if (review) plannedCare.push({ name: "Spay/neuter exemption review", dueDate: parseCalendarDay(review.reviewDate), overdue: review.reviewDate! < clock.today });
    plannedCare.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.name.localeCompare(b.name));
    return {
      animal,
      generatedDate: clock.today, generatedTime: clock.clock.time, generatedAt: clock.now,
      summary: { altered: safeAltered, rabies: rabiesStatus(rabies ? { validUntilDate: parseCalendarDay(vaccines.get(rabies.id)?.validUntilDate) } : null, clock.today),
        chips: completed.filter((e) => e.kind === "MICROCHIP").map((e) => {
          const chip = chips.get(e.id);
          return { chipNumber: e.chipNumber!, brand: chip?.brand ?? null, completedDate: parseCalendarDay(e.completedDate),
            registrationStatus: chip?.registrationStatus ?? "UNKNOWN", registryName: chip?.registryName ?? null, registrationDate: parseCalendarDay(chip?.registrationDate) };
        }) },
      completedCare,
      conditions: conditions.map((c) => ({ ...c, onsetDate: parseCalendarDay(c.onsetDate), resolvedDate: parseCalendarDay(c.resolvedDate) })),
      careEpisodes: episodes.map((e) => ({ ...e, startDate: calendarDay(e.startDate), endDate: parseCalendarDay(e.endDate) })),
      medications: orders.map(({ item, ...o }) => ({ ...o, product: item.name, startDate: calendarDay(o.startDate),
        endDate: parseCalendarDay(o.endDate), discontinuedDate: parseCalendarDay(o.discontinuedDate),
        state: orderState(slotOrderOf({ ...o, voidedAt: null }), clock.today) as Exclude<ReturnType<typeof orderState>, "VOIDED"> })),
      plannedCare,
      documents: documents.map((d) => ({ ...d, type: d.type as MedicalHistoryOutput["documents"][number]["type"], documentDate: parseCalendarDay(d.documentDate) })),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
