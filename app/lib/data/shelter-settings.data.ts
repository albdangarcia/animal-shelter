import { cache } from "react";
import prisma from "@/app/lib/prisma";
import { resolveShelterSettings } from "@/app/lib/utils/shelter-settings";
import { shelterToday, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { ensurePhoneIndexCountry } from "./phone-index.data";

// React cache deduplicates this read only within a request. A changed row is
// visible on the next request without a rebuild or a process restart.
export const getShelterSettings = cache(async () =>
  resolveShelterSettings(
    await prisma.shelterSettings.findUnique({ where: { id: "shelter" } }),
  ),
);

/**
 * Today, on the shelter's calendar.
 *
 * The single server-side answer to "what is today". It is cached per request
 * along with the settings it reads, so every part of one response agrees on
 * the day even when the request straddles midnight — two bare `new Date()`
 * calls either side of it would not.
 *
 * Callers that render a day-valued deadline in the browser receive this value
 * as a prop. The browser is never told the timezone (see docs/calendar-days.md),
 * so a comparison it makes on its own is a convenience and the server action is
 * what decides.
 */
export const getShelterToday = cache(
  async (): Promise<CalendarDay> =>
    shelterToday((await getShelterSettings()).timezone),
);

// Indexed phone lookups need the stored numbers interpreted under the same
// country as the query. Rebuild once after a change, before using that index.
export const getPhoneSearchSettings = cache(async () => {
  // A settings update may land while a rebuild waits for the row lock. Read
  // again afterwards so the country returned matches the index.
  while (true) {
    const row = await prisma.shelterSettings.findUnique({
      where: { id: "shelter" },
    });
    const settings = resolveShelterSettings(row);
    if (!row || row.phoneIndexCountry === settings.defaultPhoneCountry) {
      return settings;
    }
    await ensurePhoneIndexCountry();
  }
});
