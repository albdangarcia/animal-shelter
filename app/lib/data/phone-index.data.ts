import prisma from "@/app/lib/prisma";
import { normalizePhone } from "@/app/lib/utils/phone";
import { resolveShelterSettings } from "@/app/lib/utils/shelter-settings";

const BATCH_SIZE = 500;

// A country change can give a national number a new interpretation. Rebuild
// the derived index before any request uses it for duplicate checks or search.
// The settings row lock makes concurrent rebuild attempts serialize; updating
// the marker in the same transaction leaves no partial index visible.
export async function ensurePhoneIndexCountry(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      Array<{
        timezone: string;
        weightUnitSystem: string;
        defaultPhoneCountry: string;
        phoneIndexCountry: string | null;
      }>
    >`SELECT "timezone", "weightUnitSystem", "defaultPhoneCountry", "phoneIndexCountry"
      FROM "shelter_settings" WHERE "id" = 'shelter' FOR UPDATE`;
    if (!row) return;

    const country = resolveShelterSettings(row).defaultPhoneCountry;
    if (row.phoneIndexCountry === country) return;

    let cursor: string | undefined;
    while (true) {
      const people = await tx.person.findMany({
        where: { phone: { not: null } },
        select: { id: true, phone: true, phoneNormalized: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (people.length === 0) break;
      cursor = people[people.length - 1].id;

      for (const person of people) {
        const normalized = normalizePhone(person.phone, country);
        if (person.phoneNormalized !== normalized) {
          // A derived index refresh is not an edit to the person's record, so
          // keep updatedAt and search recency unchanged.
          await tx.$executeRaw`UPDATE "persons" SET "phoneNormalized" = ${normalized}
            WHERE "id" = ${person.id}`;
        }
      }
    }

    await tx.shelterSettings.update({
      where: { id: "shelter" },
      data: { phoneIndexCountry: country },
    });
  }, { maxWait: 10_000, timeout: 120_000 });
}
