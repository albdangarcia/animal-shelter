import type { TransactionClient } from "@/app/lib/prisma";
import {
  fallbackShelterSettings,
  shelterSettingsColumns,
} from "@/app/lib/utils/shelter-settings";

/**
 * Makes sure the one settings row exists, then locks it for the rest of the
 * caller's transaction, so a save can update it.
 *
 * The row may not exist yet (the app falls back to the environment until it
 * does), so this creates it from those fallbacks, with the phone index marked
 * as built for the fallback country, as the phone lookups already assume
 * while there is no row. It is inserted only when missing (ON CONFLICT DO
 * NOTHING), so two first saves at once both land on the one row. The lock is
 * the one the phone index rebuild takes too.
 *
 * No `next/*` and no auth imports, so a plain `node:test` can drive it.
 */
export const lockShelterSettingsRow = async (tx: TransactionClient): Promise<void> => {
  const fallback = fallbackShelterSettings();
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
  await tx.$queryRaw`SELECT id FROM shelter_settings WHERE id = 'shelter' FOR UPDATE`;
};
