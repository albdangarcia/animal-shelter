import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";

// A volunteer reads animals but may not change their details or their
// characteristics. They are offered no way in, and the edit page refuses them
// with Access Denied, where both once ended on the error page. Nor are they
// offered Add Animal, whose intake form they may not use.

const state = storageStatePathFor("volunteer-animal-edits.json");
let animalId: string;
let noCharacteristicsAnimalId: string;

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: state,
  });
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    animalId = (
      await db.query<{ id: string }>(
        `SELECT id FROM animals WHERE name = $1 LIMIT 1`,
        ["Frisco"],
      )
    ).rows[0].id;
    noCharacteristicsAnimalId = (
      await db.query<{ id: string }>(
        `SELECT a.id FROM animals a
         WHERE NOT EXISTS (
           SELECT 1 FROM animal_characteristics ac
           WHERE ac."animalId" = a.id AND ac.removed_at IS NULL
         )
         ORDER BY a.id LIMIT 1`,
      )
    ).rows[0].id;
  } finally {
    await db.end();
  }
});

test.use({ storageState: state });

test("a volunteer is offered no Edit on the animals list and is refused on the edit page", async ({
  page,
}) => {
  await page.goto("/dashboard/animals?query=Frisco");
  const row = page.locator("tbody tr").filter({ hasText: "Frisco" }).first();
  const trigger = row.getByRole("button", { name: "Open menu" });
  const profile = page.getByRole("menuitem", { name: "Profile", exact: true });
  // The trigger can swallow a click that lands before hydration settles;
  // click again only while the menu is closed.
  await expect(async () => {
    if (!(await profile.isVisible())) await trigger.click();
    await expect(profile).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`/dashboard/animals/${animalId}/edit`);
  await expect(page.getByText("Access Denied", { exact: true })).toBeVisible();
  await expect(page.getByText("Edit Animal Details")).toHaveCount(0);
});

test("a volunteer is offered no Add Animal on the animals list", async ({
  page,
}) => {
  await page.goto("/dashboard/animals");
  // The card header, where staff see Add Animal, and the table have rendered.
  await expect(page.getByText(/Manage all animals currently in your care/)).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Add Animal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Animal" })).toHaveCount(0);
});

test("a volunteer cannot open Add Characteristics on an animal with none", async ({
  page,
}) => {
  await page.goto(`/dashboard/animals/${noCharacteristicsAnimalId}/characteristics`);
  await expect(page.getByText("This animal has no characteristics assigned.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Characteristics" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
});
