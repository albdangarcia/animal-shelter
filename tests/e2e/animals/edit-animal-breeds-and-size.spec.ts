import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// The Edit Animal Details form shows what the animal was saved with: every
// breed of a mixed animal (Breed and Additional Breeds), and an empty
// Expected Adult Size left empty. The save's rules for breeds are in
// prisma/animal-update.test.ts; these show the form is wired to them.

const adminPassword = process.env.ADMIN_PASSWORD;
const state = storageStatePathFor("edit-animal-breeds-and-size.json");

const query = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.end();
  }
};

const breedNamesOf = async (animalId: string) =>
  (
    await query<{ name: string }>(
      `SELECT b.name FROM "_AnimalToBreed" ab JOIN breeds b ON b.id = ab."B"
       WHERE ab."A" = $1 ORDER BY b.name`,
      [animalId],
    )
  ).map((row) => row.name);

const oneOf = (names: string[]) =>
  new RegExp(
    `^(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
  );

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD must be available to run this spec.");
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: state,
  });
});

test.use({ storageState: state });

// A Radix select can drop a click that lands before hydration settles;
// re-clicking an open one would shut it, so click again only while closed.
const choose = async (page: Page, label: string, option: string) => {
  const choice = page.getByRole("option", { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      await page.getByLabel(label, { exact: true }).click();
    }
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
  await expect(page.getByRole("option")).toHaveCount(0);
};

test("a mixed animal's edit form shows both its breeds and a save keeps them", async ({
  page,
}) => {
  const [{ id: animalId }] = await query<{ id: string }>(
    `SELECT a.id FROM animals a JOIN "_AnimalToBreed" ab ON ab."A" = a.id
     WHERE a."listingStatus" IN ('DRAFT', 'PUBLISHED')
     GROUP BY a.id HAVING count(*) = 2 ORDER BY a.id LIMIT 1`,
  );
  const breeds = await breedNamesOf(animalId);

  await page.goto(`/dashboard/animals/${animalId}/edit`);
  // One of its breeds under Breed, once the form has its values.
  const breed = page.getByLabel("Breed *", { exact: true });
  await expect(breed).toHaveText(oneOf(breeds));
  const shown = (await breed.textContent())!.trim();
  const other = breeds.find((name) => name !== shown);
  // The other breed is a badge under Additional Breeds.
  await expect(page.getByLabel("Additional Breeds", { exact: true })).toHaveText(
    "1 selected",
  );
  await expect(page.getByRole("button", { name: `Remove ${other}` })).toBeVisible();

  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Animal updated successfully.")).toBeVisible();
  await waitForPathname(page, `/dashboard/animals/${animalId}`);
  expect(await breedNamesOf(animalId)).toEqual(breeds);
});

test("an animal with no expected adult size opens with none, and a new breed fills it", async ({
  page,
}) => {
  // One breed, which has a typical size: the form once filled it in on open.
  const [{ id: animalId, species_id: speciesId }] = await query<{
    id: string;
    species_id: string;
  }>(
    `SELECT a.id, a.species_id FROM animals a
     JOIN "_AnimalToBreed" ab ON ab."A" = a.id JOIN breeds b ON b.id = ab."B"
     WHERE a.size IS NULL AND a."listingStatus" IN ('DRAFT', 'PUBLISHED')
     GROUP BY a.id, a.species_id
     HAVING count(*) = 1 AND bool_and(b.typical_size IS NOT NULL)
     ORDER BY a.id LIMIT 1`,
  );
  const [{ name: otherBreed }] = await query<{ name: string }>(
    `SELECT b.name FROM breeds b
     WHERE b.species_id = $1 AND b.deleted_at IS NULL AND b.typical_size IS NOT NULL
       AND b.id NOT IN (SELECT "B" FROM "_AnimalToBreed" WHERE "A" = $2)
     ORDER BY b.name LIMIT 1`,
    [speciesId, animalId],
  );

  await page.goto(`/dashboard/animals/${animalId}/edit`);
  await expect(page.getByLabel("Breed *", { exact: true })).toHaveText(
    oneOf(await breedNamesOf(animalId)),
  );
  // The server's HTML says "Not specified" before the form hydrates and its
  // prefill could run. Its list opens only once hydrated, and then still
  // holds nothing.
  const size = page.getByLabel("Expected Adult Size", { exact: true });
  const notSpecified = page.getByRole("option", { name: "Not specified", exact: true });
  await expect(async () => {
    if (!(await notSpecified.isVisible())) await size.click();
    await expect(notSpecified).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(size).toHaveText("Not specified");

  // Picking another breed is a choice made here, so it suggests a size.
  await choose(page, "Breed *", otherBreed);
  await expect(size).not.toHaveText("Not specified");
});
