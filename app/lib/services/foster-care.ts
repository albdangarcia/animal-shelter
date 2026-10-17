import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { checkFostering } from "@/app/lib/data/fosters/foster-access";
import {
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import { MedicalEntryRefusal } from "./medical-entry-values";
import { recordScheduledMedicalEntry } from "./medical-entry";
import { lockMedicalItemForUse } from "./medical-catalog";
import { NotFoundError } from "@/app/lib/utils/errors";
import { nextDueDate } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/** Records only care the shelter planned, under the placement still open
 * behind the animal's lock. The foster never chooses what to schedule next. */
export async function recordFosterTreatment(
  tx: TransactionClient,
  entryId: string,
  input: { completedDate: CalendarDay; notes?: string | null },
  personId: string,
  today: CalendarDay,
) {
  const located = await tx.medicalEntry.findUnique({
    where: { id: entryId },
    select: { animalId: true },
  });
  if (!located) throw new NotFoundError("Medical entry not found.");
  await lockAnimal(tx, located.animalId);
  const placement = await checkFostering(tx, personId, located.animalId);
  const entry = await tx.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { kind: true, itemId: true },
  });
  if (entry.kind !== MedicalEntryKind.TREATMENT) {
    throw new MedicalEntryRefusal(
      "Only a scheduled treatment can be recorded here. The shelter will arrange other care.",
    );
  }
  if (input.completedDate < placement.startDate) {
    throw new MedicalEntryRefusal(
      "The date given can't be before this animal was placed with you.",
      "completedDate",
    );
  }
  // Keep the repeat rule stable through recording and scheduling, as the
  // entry writer keeps the item's dose defaults stable. An admin may have
  // retired or changed this item while this transaction waited for it.
  await lockMedicalItemForUse(tx, entry.itemId!);
  const item = await tx.medicalItem.findUniqueOrThrow({
    where: { id: entry.itemId! },
    select: {
      repeatIntervalDays: true,
      retiredAt: true,
      species: { select: { id: true } },
    },
  });
  const animal = await tx.animal.findUniqueOrThrow({
    where: { id: located.animalId },
    select: { speciesId: true },
  });
  const speciesEligible = item.species.length === 0 ||
    item.species.some((species) => species.id === animal.speciesId);
  const another = await tx.medicalEntry.findFirst({
    where: {
      animalId: located.animalId,
      itemId: entry.itemId,
      id: { not: entryId },
      status: MedicalEntryStatus.SCHEDULED,
      voidedAt: null,
    },
    select: { id: true },
  });
  const dueDate = item.repeatIntervalDays && !item.retiredAt && speciesEligible && !another
    ? nextDueDate(input.completedDate, item.repeatIntervalDays, today)
    : null;
  return recordScheduledMedicalEntry(
    tx,
    entryId,
    {
      kind: MedicalEntryKind.TREATMENT,
      source: MedicalEntrySource.IN_HOUSE,
      completedDate: input.completedDate,
      itemId: entry.itemId!,
      notes: input.notes,
      scheduleNext: dueDate ? { dueDate } : null,
    },
    personId,
    today,
    { reportedByFoster: true },
  );
}
