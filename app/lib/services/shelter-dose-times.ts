import type { TransactionClient } from "@/app/lib/prisma";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import { doseSlotEndsIssue } from "@/app/lib/utils/shelter-settings";
import { lockShelterSettingsRow } from "@/app/lib/services/shelter-settings-row";

/**
 * The times the shelter's medication dose slots end: AM, Midday and PM, as
 * "HH:mm" on its wall clock. A slot with no dose recorded by its end reads
 * as missed. A change reinterprets every slot when it is next read, and
 * moves no stored dose: a dose holds its day and slot, not an instant.
 *
 * The settings row may not exist yet, so saving creates it from the
 * fallbacks (see `lockShelterSettingsRow`).
 *
 * This module has **no `next/*` and no auth imports**, so a plain `node:test`
 * can drive it. It runs inside the caller's `prisma.$transaction`.
 */
export const updateDoseSlotEnds = async (
  tx: TransactionClient,
  ends: DoseSlotEnds,
): Promise<DoseSlotEnds> => {
  const issue = doseSlotEndsIssue(ends);
  if (issue) throw new MedicalEntryRefusal(issue.message, issue.slot);

  await lockShelterSettingsRow(tx);
  await tx.shelterSettings.update({
    where: { id: "shelter" },
    data: {
      amDoseEndTime: ends.AM,
      middayDoseEndTime: ends.MIDDAY,
      pmDoseEndTime: ends.PM,
    },
  });
  return { ...ends };
};
