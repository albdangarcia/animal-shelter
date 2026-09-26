import { expect, test, type Locator, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// An animal can leave while it is in foster: it dies there, is transferred
// out, or is adopted. Recording that outcome ends the placement, the outcome
// form says so before it is submitted, and the foster's placement history
// says how the placement ended. A foster adopting from their own
// foster-to-adopt placement is sent to the conversion instead.

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor(
  "outcome-ends-foster-placement.state.json",
);

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the outcome ends foster placement E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today is the shelter's today.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

const OUTCOMES_PATH = "/dashboard/outcomes";

// Every other spec and support file, read as text. This spec archives its
// animals, so it only takes animals no other spec names.
const E2E_DIR = path.resolve(__dirname, "..");
const OTHER_SOURCES = (fs.readdirSync(E2E_DIR, { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".ts") && path.basename(file) !== path.basename(__filename),
  )
  .map((file) => fs.readFileSync(path.join(E2E_DIR, file), "utf8"))
  .join("\n");
const isNamedElsewhere = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
    "u",
  ).test(OTHER_SOURCES);

// Days are handled as `yyyy-MM-dd` keys, as the app stores them.
type DayKey = string;

const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

// The app prints a day as "Feb 1, 2026".
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const withDb = async <T>(run: (client: pg.Client) => Promise<T>) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

// The app's ids are validated as CUIDs: lowercase letters and digits.
const newId = () =>
  `c${Array.from(crypto.randomBytes(24), (byte) =>
    "abcdefghijklmnopqrstuvwxyz0123456789".charAt(byte % 36),
  ).join("")}`;

interface Animal {
  id: string;
  name: string;
}

interface Foster {
  profileId: string;
  personId: string;
  name: string;
}

/**
 * Published animals on their first stay, with nothing an outcome would also
 * close, that no other spec names. Each one's only intake is moved to
 * `intakeDay`, so the placement below starts inside a known stay.
 */
const takeAnimals = async (count: number, intakeDay: DayKey) =>
  withDb(async (client) => {
    const { rows } = await client.query<Animal>(
      `SELECT a.id, a.name FROM animals a
       WHERE a."listingStatus" = 'PUBLISHED'
         AND (SELECT count(*) FROM intakes i WHERE i."animalId" = a.id) = 1
         AND NOT EXISTS (SELECT 1 FROM outcomes o WHERE o."animalId" = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM adoption_applications p WHERE p.animal_id = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM foster_placements f WHERE f.animal_id = a.id)
       ORDER BY a.name, a.id`,
    );
    const names = new Set<string>();
    const picked = rows.filter((row) => {
      // The outcome list is searched by name, so each name is taken once.
      if (names.has(row.name) || isNamedElsewhere(row.name)) return false;
      names.add(row.name);
      return true;
    });
    if (picked.length < count) {
      throw new Error("Not enough first-stay animals free of other specs.");
    }
    const chosen = picked.slice(0, count);
    for (const animal of chosen) {
      await client.query(
        `UPDATE intakes SET "intakeDate" = $2 WHERE "animalId" = $1`,
        [animal.id, intakeDay],
      );
    }
    return chosen;
  });

/**
 * Places `animal` with an active foster who has room, with the writes the
 * placement form makes, but starting on `startDay` rather than today, so the
 * outcome can be dated around it. Each case ends its placement before the
 * next is made, so one free slot is enough.
 */
const placeInFoster = async (
  animal: Animal,
  type: "GENERAL" | "FOSTER_TO_ADOPT",
  startDay: DayKey,
) =>
  withDb(async (client) => {
    const { rows: fosters } = await client.query<Foster>(
      `SELECT fp.id AS "profileId", p.id AS "personId", p.name
       FROM foster_profiles fp JOIN persons p ON p.id = fp.person_id
       WHERE fp.status = 'ACTIVE'
         AND (SELECT count(*) FROM foster_placements x
              WHERE x.foster_profile_id = fp.id AND x.end_date IS NULL)
           < fp.max_animals
       ORDER BY fp.id LIMIT 1`,
    );
    if (fosters.length === 0) {
      throw new Error("No active foster has room for a placement.");
    }
    const [foster] = fosters;
    const {
      rows: [admin],
    } = await client.query<{ id: string }>(
      `SELECT id FROM persons WHERE email = 'admin@example.com'`,
    );
    const placementId = newId();
    await client.query(
      `INSERT INTO foster_placements
         (id, type, start_date, animal_id, foster_profile_id,
          previous_unit_id, previous_listing_status, placed_by_id, "updatedAt")
       SELECT $1, $2::"FosterPlacementType", $3, a.id, $5, a.current_unit_id,
              CASE WHEN $2 = 'FOSTER_TO_ADOPT' THEN a."listingStatus" END,
              $6, now()
       FROM animals a WHERE a.id = $4`,
      [placementId, type, startDay, animal.id, foster.profileId, admin.id],
    );
    await client.query(
      `UPDATE animals SET current_unit_id = NULL,
         "listingStatus" = CASE WHEN $2 = 'FOSTER_TO_ADOPT'
           THEN 'PENDING_ADOPTION'::"AnimalListingStatus"
           ELSE "listingStatus" END
       WHERE id = $1`,
      [animal.id, type],
    );
    await client.query(
      `INSERT INTO animal_activity_logs
         (id, "activityType", "animalId", "changedById", "changeSummary",
          "changedAt")
       VALUES ($1, 'FOSTER_PLACED', $2, $3, $4, now())`,
      [newId(), animal.id, admin.id, `Placed with foster ${foster.name}.`],
    );
    return { placementId, foster };
  });

/**
 * An approved adoption application from `foster` for `animal`, which moves
 * a published listing to Pending Adoption as approving one does.
 */
const approvedApplication = async (animal: Animal, foster: Foster) =>
  withDb(async (client) => {
    const id = newId();
    await client.query(
      `INSERT INTO adoption_applications
         (id, applicant_name, applicant_email, applicant_phone,
          applicant_address_line1, applicant_city, applicant_state,
          applicant_zip_code, living_situation, household_size, children_ages,
          reason_for_adoption, status, source, applicant_id, animal_id,
          updated_at)
       VALUES ($1, $2, $3, '212-555-0199', '12 Test Lane', 'New York', 'NY',
               '10001', 'OWN_HOME', 2, '{}', 'Adopting the animal I foster.',
               'APPROVED', 'STAFF', $4, $5, now())`,
      [
        id,
        foster.name,
        `outcome-foster-e2e-${Date.now()}@example.com`,
        foster.personId,
        animal.id,
      ],
    );
    await client.query(
      `UPDATE animals SET "listingStatus" = 'PENDING_ADOPTION'
       WHERE id = $1 AND "listingStatus" = 'PUBLISHED'`,
      [animal.id],
    );
    return id;
  });

const setApplicationStatus = (
  applicationId: string,
  status: "PENDING" | "APPROVED",
) =>
  withDb((client) =>
    client.query(
      `UPDATE adoption_applications SET status = $2::"ApplicationStatus"
       WHERE id = $1`,
      [applicationId, status],
    ),
  );

const readPlacement = (placementId: string) =>
  withDb(async (client) => {
    const {
      rows: [row],
    } = await client.query<{
      endDate: string | null;
      returnReason: string | null;
      outcomeId: string | null;
    }>(
      `SELECT end_date AS "endDate", return_reason AS "returnReason",
              outcome_id AS "outcomeId"
       FROM foster_placements WHERE id = $1`,
      [placementId],
    );
    return row;
  });

// The animal's live outcome, or null when it has none. More than one is a
// failure, not a null, so a comparison with a placement's outcomeId cannot
// pass on two nulls.
const liveOutcomeId = (animalId: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM outcomes WHERE "animalId" = $1 AND "reversedAt" IS NULL`,
      [animalId],
    );
    expect(rows.length).toBeLessThanOrEqual(1);
    return rows[0]?.id ?? null;
  });

// An outcome's linked application, to check a conversion linked it.
const outcomeApplicationId = (outcomeId: string) =>
  withDb(async (client) => {
    const {
      rows: [row],
    } = await client.query<{ applicationId: string | null }>(
      `SELECT "adoptionApplicationId" AS "applicationId" FROM outcomes
       WHERE id = $1`,
      [outcomeId],
    );
    return row?.applicationId ?? null;
  });

// Clicking submit before hydration makes the browser submit the form itself,
// and nothing reaches the action. React marks each DOM node it has attached
// to, so wait for that on the form.
const waitForFormHydration = async (page: Page, submitName: string) => {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: submitName }) });
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

// A Radix select can drop a click that lands before hydration settles;
// re-clicking an open one would shut it, so click again only while it is
// still closed.
const openSelect = async (page: Page, label: string) => {
  const options = page.getByRole("option");
  await expect(async () => {
    if (!(await options.first().isVisible())) {
      await page.getByLabel(label, { exact: true }).click();
    }
    await expect(options.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return options;
};

const chooseFromSelect = async (page: Page, label: string, option: string) => {
  const options = await openSelect(page, label);
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(options).toHaveCount(0);
};

const OUTCOME_DATE = /^Date of Outcome \*:/;
const INTAKE_DATE = /^Intake Date:/;

const dateTrigger = (page: Page, label: RegExp = OUTCOME_DATE) =>
  page.getByRole("button", { name: label });

// data-day is the browser's en-US short date: M/D/YYYY, no padding.
const dataDayOf = (day: DayKey) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${month}/${date}/${year}`;
};

// The popover does not close on select, so it may already be open. The days
// this spec picks are within two weeks of today, so at most one step back.
const pickDay = async (
  page: Page,
  day: DayKey,
  label: RegExp = OUTCOME_DATE,
) => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await dateTrigger(page, label).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const cell = calendar.locator(`button[data-day="${dataDayOf(day)}"]`);
  if (!(await cell.isVisible())) {
    await calendar
      .getByRole("button", { name: "Go to the Previous Month" })
      .click();
  }
  await cell.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
};

const toast = (page: Page, message: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message });

const banner = (page: Page) =>
  page
    .locator("div")
    .filter({ hasText: /^In foster with/ })
    .first();

// The foster's placement history row for `animal`.
const historyRow = async (page: Page, foster: Foster, animal: Animal) => {
  await page.goto(`/dashboard/people-directory/${foster.personId}/fostering`);
  await expect(
    page.getByText("Placement History", { exact: true }),
  ).toBeVisible();
  return page
    .locator("tbody tr")
    .filter({ has: page.locator(`a[href="/dashboard/animals/${animal.id}"]`) });
};

// The row's Radix menu occasionally swallows the first click right after a
// navigation, before hydration settles. Retry, re-clicking only while the
// menu is closed so it is never toggled shut.
const openRowMenu = async (row: Locator, itemName: string | RegExp) => {
  const trigger = row.getByRole("button", { name: "Open menu" });
  const item = row.page().getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return item;
};

const today = todayIn(SHELTER_ZONE);
const intakeDay = shiftDay(today, -60);
const placementStart = shiftDay(today, -10);

// Placed in `beforeAll`: `deceased` for the first three cases in turn,
// `convertible` for the foster-to-adopt case, `adoptedByFoster` for the
// general adoption, `reIntaken` for the reversal after a re-intake.
let deceased: Animal;
let convertible: Animal;
let adoptedByFoster: Animal;
let reIntaken: Animal;
let deceasedPlacement: { placementId: string; foster: Foster };

test.beforeAll(async () => {
  [deceased, convertible, adoptedByFoster, reIntaken] = await takeAnimals(
    4,
    intakeDay,
  );
});

test("an outcome recorded while the animal is in foster says so, and ends the placement", async ({
  page,
}) => {
  deceasedPlacement = await placeInFoster(deceased, "GENERAL", placementStart);
  const { placementId, foster } = deceasedPlacement;

  await page.goto(`${OUTCOMES_PATH}/create?animalId=${deceased.id}`);
  await expect(
    page.getByText(
      `${deceased.name} is in foster with ${foster.name} since ${printedDay(placementStart)}. Recording this outcome ends that placement.`,
    ),
  ).toBeVisible();
  await waitForFormHydration(page, "Process Outcome");
  await chooseFromSelect(page, "Outcome Type *", "Deceased");

  // Inside the stay but before the placement began: refused under the
  // picker, with nothing written.
  const beforeStart = shiftDay(placementStart, -1);
  await pickDay(page, beforeStart);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  const refusal = `The outcome date can't be before the foster placement with ${foster.name} began on ${printedDay(placementStart)}.`;
  await expect(
    page
      .locator('[data-slot="form-item"]')
      .filter({ has: dateTrigger(page) })
      .locator('[data-slot="form-message"]'),
  ).toHaveText(refusal);
  await expect(toast(page, refusal)).toBeVisible();
  expect(await liveOutcomeId(deceased.id)).toBeNull();

  await pickDay(page, today);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(toast(page, "Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);

  const outcomeId = await liveOutcomeId(deceased.id);
  expect(outcomeId).not.toBeNull();
  expect(await readPlacement(placementId)).toEqual({
    endDate: today,
    returnReason: "ENDED_BY_OUTCOME",
    outcomeId,
  });

  await page.goto(`/dashboard/animals/${deceased.id}`);
  await expect(page.getByText("Archived").first()).toBeVisible();
  await expect(banner(page)).toBeHidden();

  // The history says how the placement ended, not just that an outcome did.
  const row = await historyRow(page, foster, deceased);
  await expect(row).toContainText(printedDay(today));
  await expect(row).toContainText("Ended: deceased");
});

test("correcting that outcome's day says it moves the placement's end, and moves it", async ({
  page,
}) => {
  const { placementId, foster } = deceasedPlacement;
  const outcomeId = await liveOutcomeId(deceased.id);
  const correctedDay = shiftDay(today, -2);

  await page.goto(`${OUTCOMES_PATH}/${outcomeId}/edit`);
  await waitForFormHydration(page, "Update Outcome");
  await expect(
    page.getByText(
      "This outcome ended a foster placement. Changing the date moves the placement's end day with it.",
    ),
  ).toBeVisible();

  await pickDay(page, correctedDay);
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(toast(page, "Outcome updated successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);

  expect((await readPlacement(placementId)).endDate).toBe(correctedDay);
  const row = await historyRow(page, foster, deceased);
  await expect(row).toContainText(printedDay(correctedDay));
  await expect(row).toContainText("Ended: deceased");
});

test("reversing it puts the animal back in foster, and the return form offers no outcome reason", async ({
  page,
}) => {
  const { placementId, foster } = deceasedPlacement;

  await page.goto(
    `${OUTCOMES_PATH}?query=${encodeURIComponent(deceased.name)}&pageSize=50`,
  );
  const outcomeRow = page.locator("tbody tr").filter({
    has: page.locator(`a[href="/dashboard/animals/${deceased.id}"]`),
  });
  await (await openRowMenu(outcomeRow, /^Reverse/)).click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByLabel("Reason for reversal")
    .fill(`Recorded on the wrong animal ${Date.now()}`);
  await dialog.getByRole("button", { name: "Reverse Outcome" }).click();
  await expect(page.getByText(/^Outcome reversed\./)).toBeVisible();

  expect(await readPlacement(placementId)).toMatchObject({
    endDate: null,
    returnReason: null,
  });
  const row = await historyRow(page, foster, deceased);
  await expect(row).toContainText("Ongoing");
  await expect(row).not.toContainText("Ended");

  await page.goto(`/dashboard/animals/${deceased.id}`);
  await expect(banner(page)).toContainText(foster.name);
  await banner(page).getByRole("link", { name: "Return from Foster" }).click();
  await page.waitForURL("**/return");
  await waitForFormHydration(page, "Return From Foster");

  // Only an outcome records these two, and the server refuses them here.
  const options = await openSelect(page, "Return Reason *");
  await expect(
    page.getByRole("option", { name: "Returned To Shelter", exact: true }),
  ).toBeVisible();
  await expect(options.filter({ hasText: "Ended By Outcome" })).toHaveCount(0);
  await expect(options.filter({ hasText: "Adopted By Foster" })).toHaveCount(0);
  await page
    .getByRole("option", { name: "Returned To Shelter", exact: true })
    .click();
  await expect(options).toHaveCount(0);

  // Returned, so the foster's slot is free for the next case. The fixture
  // may not have left the animal a unit to go back to.
  const unitTrigger = page.getByLabel("Unit *", { exact: true });
  if ((await unitTrigger.innerText()).includes("Select a unit")) {
    await page.getByText("Select a location").click();
    await page.getByRole("option").first().click();
    await unitTrigger.click();
    await page.getByRole("option").first().click();
  }
  await page.getByRole("button", { name: "Return From Foster" }).click();
  await expect(toast(page, "Animal returned from foster.")).toBeVisible();
});

test("a foster adopting from their foster-to-adopt placement is sent to the conversion", async ({
  page,
}) => {
  const { placementId, foster } = await placeInFoster(
    convertible,
    "FOSTER_TO_ADOPT",
    placementStart,
  );
  const applicationId = await approvedApplication(convertible, foster);

  // Not yet approved: the conversion would not offer it, so the page shows
  // the form and leaves the refusal to the server, which checks approval
  // first.
  await setApplicationStatus(applicationId, "PENDING");
  await page.goto(`${OUTCOMES_PATH}/create?applicationId=${applicationId}`);
  await expect(
    page.getByRole("button", { name: "Process Outcome" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Convert the Foster Placement" }),
  ).toHaveCount(0);

  await setApplicationStatus(applicationId, "APPROVED");
  await page.goto(`${OUTCOMES_PATH}/create?applicationId=${applicationId}`);
  await expect(
    page.getByRole("heading", { name: "Convert the Foster Placement" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `is in a foster-to-adopt placement with ${foster.name}, who is adopting through this application.`,
    ),
  ).toBeVisible();
  // No form to submit: the server would refuse it.
  await expect(
    page.getByRole("button", { name: "Process Outcome" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Convert to Adoption" }).click();
  await waitForPathname(
    page,
    `/dashboard/fosters/placements/${placementId}/convert`,
  );
  await expect(
    page.getByRole("radio", { name: `${foster.name}'s application` }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Convert to Adoption" }).click();
  await page.getByRole("button", { name: "Confirm & Convert" }).click();
  await expect(
    page.getByText("Foster placement converted to adoption."),
  ).toBeVisible();

  // The conversion recorded the adoption against this application, as the
  // outcome page said it would.
  const outcomeId = await liveOutcomeId(convertible.id);
  expect(outcomeId).not.toBeNull();
  expect(await readPlacement(placementId)).toEqual({
    endDate: today,
    returnReason: "ADOPTED_BY_FOSTER",
    outcomeId,
  });
  expect(await outcomeApplicationId(outcomeId!)).toBe(applicationId);
});

test("a general placement adopted by its own foster ends as adopted by the foster", async ({
  page,
}) => {
  const { placementId, foster } = await placeInFoster(
    adoptedByFoster,
    "GENERAL",
    placementStart,
  );
  const applicationId = await approvedApplication(adoptedByFoster, foster);

  // A general placement has no conversion, so this form records it.
  await page.goto(`${OUTCOMES_PATH}/create?applicationId=${applicationId}`);
  await expect(
    page.getByText(
      `${adoptedByFoster.name} is in foster with ${foster.name} since ${printedDay(placementStart)}. Recording this outcome ends that placement.`,
    ),
  ).toBeVisible();
  await waitForFormHydration(page, "Process Outcome");
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(toast(page, "Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);

  const outcomeId = await liveOutcomeId(adoptedByFoster.id);
  expect(outcomeId).not.toBeNull();
  expect(await readPlacement(placementId)).toEqual({
    endDate: today,
    returnReason: "ADOPTED_BY_FOSTER",
    outcomeId,
  });
  expect(await outcomeApplicationId(outcomeId!)).toBe(applicationId);
  const row = await historyRow(page, foster, adoptedByFoster);
  await expect(row).toContainText(printedDay(today));
  await expect(row).toContainText("Adopted By Foster");
});

test("an outcome reversed after a re-intake leaves the placement ended, marked reversed", async ({
  page,
}) => {
  const { placementId, foster } = await placeInFoster(
    reIntaken,
    "GENERAL",
    placementStart,
  );
  const outcomeDay = shiftDay(today, -3);

  await page.goto(`${OUTCOMES_PATH}/create?animalId=${reIntaken.id}`);
  await waitForFormHydration(page, "Process Outcome");
  await chooseFromSelect(page, "Outcome Type *", "Other");
  await pickDay(page, outcomeDay);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(toast(page, "Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);
  const outcomeId = await liveOutcomeId(reIntaken.id);
  expect(outcomeId).not.toBeNull();

  // Back in the shelter's care, so the outcome no longer archives the animal
  // and its reversal has nothing to reopen.
  await page.goto(`/dashboard/animals/${reIntaken.id}/intake/create`);
  await waitForFormHydration(page, "Process Re-Intake");
  await chooseFromSelect(page, "Intake Type", "Seize");
  // Not today: the picker opens on today already selected, and clicking a
  // selected day clears it.
  await pickDay(page, shiftDay(today, -1), INTAKE_DATE);
  await page.getByRole("button", { name: "Process Re-Intake" }).click();
  await expect(
    toast(page, "Animal re-intake processed successfully."),
  ).toBeVisible();
  await waitForPathname(page, `/dashboard/animals/${reIntaken.id}`);

  await page.goto(
    `${OUTCOMES_PATH}?query=${encodeURIComponent(reIntaken.name)}&pageSize=50`,
  );
  const outcomeRow = page.locator("tbody tr").filter({
    has: page.locator(`a[href="/dashboard/animals/${reIntaken.id}"]`),
  });
  await (await openRowMenu(outcomeRow, /^Reverse/)).click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByLabel("Reason for reversal")
    .fill(`Recorded against the wrong stay ${Date.now()}`);
  await dialog.getByRole("button", { name: "Reverse Outcome" }).click();
  await expect(page.getByText(/^Outcome reversed\./)).toBeVisible();

  expect(await readPlacement(placementId)).toEqual({
    endDate: outcomeDay,
    returnReason: "ENDED_BY_OUTCOME",
    outcomeId,
  });
  const row = await historyRow(page, foster, reIntaken);
  await expect(row).toContainText(printedDay(outcomeDay));
  await expect(row).toContainText("Ended: other (reversed)");
});
