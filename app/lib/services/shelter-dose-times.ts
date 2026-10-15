import type { TransactionClient } from "@/app/lib/prisma";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import {
  doseSlotEndsIssue,
  fallbackShelterSettings,
  shelterSettingsColumns,
} from "@/app/lib/utils/shelter-settings";

/**
 * The times the shelter's medication dose slots end: AM, Midday and PM, as
 * "HH:mm" on its wall clock. A slot with no dose recorded by its end reads
 * as missed. A change reinterprets every slot when it is next read, and
 * moves no stored dose: a dose holds its day and slot, not an instant.
 *
 * The settings row may not exist yet (the app falls back to the environment
 * until it does), so saving creates it from those fallbacks, with the phone
 * index marked as built for the fallback country, as the phone lookups
 * already assume while there is no row.
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

  const fallback = fallbackShelterSettings();
  // Inserted only when missing (ON CONFLICT DO NOTHING), so two first saves
  // at once both land on the one row.
  await tx.shelterSettings.createMany({
    data: [
      {
        id: "shelter",
        ...shelterSettingsColumns(fallback),
        phoneIndexCountry: fallback.defaultPhoneCountry,
      },
    ],
    skipDuplicates: true,
  });
  // The lock the phone index rebuild takes too.
  await tx.$queryRaw`SELECT id FROM shelter_settings WHERE id = 'shelter' FOR UPDATE`;
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
