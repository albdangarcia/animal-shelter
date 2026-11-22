import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
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
const volunteerStatePath = storageStatePathFor(
  "shelter-board-volunteer.state.json",
);

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
  // Signed in once for the file, not in the test, so a retry doesn't sign in
  // again against the rate limit.
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerStatePath,
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

test("a volunteer reads the board but can't pick up an animal", async ({
  browser,
}) => {
  const housed = await housedAnimal();
  const context = await browser.newContext({
    storageState: volunteerStatePath,
  });
  try {
    const page = await context.newPage();
    await page.goto("/dashboard/locations");

    const unit = page.getByRole("group", {
      name: `${housed.unit} in ${housed.location}`,
      exact: true,
    });
    // The animal is still shown in its unit, but not as something to drag:
    // moving needs ANIMAL_INFO_MANAGE, which a volunteer doesn't hold.
    const chip = unit.getByRole("group", { name: housed.animal, exact: true });
    await expect(chip).toBeVisible();
    await expect(
      unit.getByRole("button", { name: housed.animal, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('[aria-roledescription="draggable"]')).toHaveCount(
      0,
    );
    await expect(page.getByText("To pick up an animal")).toHaveCount(0);
    // It still takes focus, which opens its peek for a keyboard user.
    await chip.focus();
    await expect(
      page.getByRole("link", { name: "View full profile" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the keyboard moves a picked-up animal along its unit's row", async ({
  page,
}) => {
  const housed = await housedAnimal();
  await page.goto("/dashboard/locations");

  const location = page
    .getByRole("group")
    .filter({
      has: page.getByRole("heading", { name: housed.location, exact: true }),
    });
  const unitName = `${housed.unit} in ${housed.location}`;
  const unit = location.getByRole("group", { name: unitName, exact: true });
  const chip = unit.getByRole("button", { name: housed.animal, exact: true });
  await expect(chip).toBeVisible();

  // The target Right should reach: the nearest tile after this unit's in the
  // same row of its location; from the end of a row, the Unplaced tray when
  // it is a column beside the tiles, or nothing when it is below them.
  const from = await unit.boundingBox();
  if (!from) throw new Error(`${unitName} has no box.`);
  const tiles = location.getByRole("group").filter({ hasNot: chip });
  const beside: { name: string; x: number }[] = [];
  for (const tile of await tiles.all()) {
    const box = await tile.boundingBox();
    const name = await tile.getAttribute("aria-label");
    if (box && name && box.y === from.y && box.x > from.x) {
      beside.push({ name, x: box.x });
    }
  }
  beside.sort((a, b) => a.x - b.x);
  const tray = await page
    .getByText("On site but not assigned to a unit", { exact: false })
    .boundingBox();
  const trayBeside = tray != null && tray.x >= from.x + from.width;
  const next =
    beside[0]?.name ?? (trayBeside ? "Unplaced" : unitName);

  const announced = page.locator('[id^="DndLiveRegion"]');
  await chip.focus();
  await page.keyboard.press("Space");
  // "Picked up" is replaced at once by where the chip starts: over its unit.
  await expect(announced).toHaveText(`${housed.animal} is over ${unitName}.`);
  await page.keyboard.press("ArrowRight");
  await expect(announced).toHaveText(`${housed.animal} is over ${next}.`);
  await page.keyboard.press("Escape");
  await expect(announced).toHaveText(`Moving ${housed.animal} was cancelled.`);
  // Cancelled, so the animal is still in its unit.
  await expect(chip).toBeVisible();
});
