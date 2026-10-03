import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The shelter board draws each location's units with the animals housed in
// them. What it lists is proved below the browser: which animals each part of
// the board reads, an animal that has left on none of them
// (prisma/shelter-board.test.ts); an outcome taking the animal out of its unit
// (prisma/outcome-recording.test.ts) and a reversal putting it back
// (prisma/outcome-reversal.test.ts). This only shows that the page is wired
// to its data and draws it.

const adminPassword = process.env.ADMIN_PASSWORD;

const storageStatePath = storageStatePathFor("shelter-board.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the shelter board E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

/**
 * An animal housed in a unit as the run has left it, with its unit's
 * occupancy. Other specs record outcomes and move animals, so no seeded
 * animal is sure to be in its seeded unit by now.
 *
 * Its name is one no other animal on the board shares, so one chip answers
 * to it, and it comes first by name in its unit, as the board sorts them, so
 * it is shown before any "+N more".
 */
const housedAnimal = async () => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{
      animal: string;
      unit: string;
      location: string;
      capacity: number;
      occupants: number;
    }>(
      `SELECT a.name AS animal, u.name AS unit, l.name AS location,
              u.capacity,
              (SELECT count(*)::int FROM animals o
               WHERE o.current_unit_id = u.id
                 AND o."listingStatus" <> 'ARCHIVED') AS occupants
       FROM animals a
       JOIN units u ON u.id = a.current_unit_id AND u.deleted_at IS NULL
       JOIN locations l ON l.id = u.location_id AND l.deleted_at IS NULL
       WHERE a."listingStatus" <> 'ARCHIVED'
         AND NOT EXISTS (
           SELECT 1 FROM animals b
           WHERE b.name = a.name AND b.id <> a.id
             AND b."listingStatus" <> 'ARCHIVED')
         AND NOT EXISTS (
           SELECT 1 FROM animals f
           WHERE f.current_unit_id = a.current_unit_id
             AND f."listingStatus" <> 'ARCHIVED' AND f.name < a.name)
       ORDER BY l.name, u.name, a.name
       LIMIT 1`,
    );
    if (!rows[0]) {
      throw new Error("No animal is housed in a unit.");
    }
    return rows[0];
  } finally {
    await client.end();
  }
};

test("the shelter board draws a unit with the animal housed in it", async ({
  page,
}) => {
  const housed = await housedAnimal();
  await page.goto("/dashboard/locations");

  // Each location is a group holding its heading, and each unit's tile a
  // group inside it, named for the unit; unit names are unique within a
  // location. Each occupant is a draggable chip named for the animal. So no
  // other text on the board can stand in for any of them.
  const location = page
    .getByRole("group")
    .filter({
      has: page.getByRole("heading", { name: housed.location, exact: true }),
    });
  const unit = location.getByRole("group", {
    name: `${housed.unit} in ${housed.location}`,
    exact: true,
  });
  await expect(
    unit
      .getByRole("button", { name: housed.animal, exact: true })
      .and(page.locator('[aria-roledescription="draggable"]')),
  ).toBeVisible();
  // The tile's header row holds the unit's name, then the count.
  await expect(
    unit.locator(":scope > div").first().locator(":scope > span").last(),
  ).toHaveText(`${housed.occupants}/${housed.capacity}`);
});
