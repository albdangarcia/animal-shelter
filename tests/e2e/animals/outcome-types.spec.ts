import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The outcome form is wired to the Shelter Animals Count types: return to
// field and lost in care, and "other" named as the live outcome it now means.
// Recording, reversing and the foster placement are database tests
// (prisma/outcome-rtf-lost-in-care.test.ts); this only shows the page offers
// them, and that the outcomes list names a recorded one.

const adminPassword = process.env.ADMIN_PASSWORD;
const adminState = storageStatePathFor("outcome-types-admin.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the outcome types E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
});

test.use({ storageState: adminState });

/** A published animal, read only: nothing here records an outcome. */
const publishedAnimalId = async () => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM animals WHERE "listingStatus" = 'PUBLISHED' ORDER BY name DESC LIMIT 1`,
    );
    expect(rows).toHaveLength(1);
    return rows[0].id;
  } finally {
    await client.end();
  }
};

// The select can drop a click that lands before hydration settles; re-clicking
// an open one would shut it, so click again only while it is still closed.
const openOutcomeTypes = async (page: Page) => {
  const listbox = page.getByRole("listbox");
  await expect(async () => {
    if (!(await listbox.isVisible())) {
      await page
        .getByRole("combobox", { name: "Outcome Type *", exact: true })
        .click();
    }
    await expect(listbox).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return listbox;
};

test("the outcome form offers return to field and lost in care, and says what each covers", async ({
  page,
}) => {
  await page.goto(
    `/dashboard/outcomes/create?animalId=${await publishedAnimalId()}`,
  );

  const types = await openOutcomeTypes(page);
  for (const name of ["Return To Field", "Lost In Care", "Other Live Outcome"]) {
    await expect(types.getByRole("option", { name, exact: true })).toBeVisible();
  }
  await expect(types.getByRole("option", { name: "Other", exact: true })).toHaveCount(0);

  await types.getByRole("option", { name: "Lost In Care", exact: true }).click();
  await expect(
    page.getByText(
      "The animal escaped, or its outcome is unknown. Counts as a non-live outcome.",
    ),
  ).toBeVisible();

  // The seed records two of each; the list names them.
  await page.goto("/dashboard/outcomes?type=LOST_IN_CARE");
  await expect(
    page.locator("tbody tr").filter({ hasText: "Lost In Care" }).first(),
  ).toBeVisible();
});
