import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The vitals form's wiring to the date picker. Clicking the day a required
// picker already shows selected must not empty the field; that behaviour is
// DayField's and DateField's, and components/forms/date-fields.test.tsx owns
// it. This is the vitals form's only browser test: it shows the form passes
// `required` (the trigger's "Date Recorded *:" name) and that the date
// survives a submit there. Nothing is saved: with no measurement entered, a
// submit only validates.

const adminPassword = process.env.ADMIN_PASSWORD;

const storageStatePath = storageStatePathFor("required-date-deselect.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the required date E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the pickers open on the shelter's today.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

const firstValue = async (sql: string) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ value: string }>(sql);
    if (rows.length === 0) throw new Error(`No row for: ${sql}`);
    return rows[0].value;
  } finally {
    await client.end();
  }
};

// Clicking submit before hydration makes the browser submit the form itself (a
// GET that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
const waitForFormHydration = async (page: Page, submitName: string) => {
  const form = formWithSubmit(page, submitName);
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

const formWithSubmit = (page: Page, submitName: string) =>
  page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: submitName }) });

// The popover's own content, rather than any dialog: the vitals form sits in
// a dialog itself.
const calendarOf = (page: Page) => page.locator('[data-slot="popover-content"]');

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openCalendar = async (page: Page, trigger: Locator) => {
  const calendar = calendarOf(page);
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await trigger.click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

const openVitalsForm = async (page: Page) => {
  const animalId = await firstValue(
    `SELECT id AS value FROM animals WHERE name = 'Frisco' ORDER BY id`,
  );
  await page.goto(`/dashboard/animals/${animalId}/vitals`);
  // A click that lands before hydration settles opens nothing; re-clicking an
  // open dialog's trigger is not possible, so click only while it is closed.
  const dialog = page.getByRole("dialog", { name: "Record Vitals" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Record Vitals" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await waitForFormHydration(page, "Record Vitals");
  return dialog;
};

test("clicking the selected day again keeps the vitals form's date recorded", async ({
  page,
}) => {
  const dialog = await openVitalsForm(page);

  const trigger = page.getByRole("button", { name: /^Date Recorded \*:/ });
  const before = await trigger.getAttribute("aria-label");
  expect(before).not.toBeNull();

  // The selected day is the only cell react-day-picker marks selected.
  const calendar = await openCalendar(page, trigger);
  const selected = calendar.locator(
    'td[data-selected="true"] button[data-day]',
  );
  // The calendar opens on today's month, and no day it allows is later, so
  // a day picked earlier is reached by paging back.
  for (let step = 0; (await selected.count()) === 0; step++) {
    if (step > 36) throw new Error("The calendar never reached the day.");
    await calendar
      .getByRole("button", { name: "Go to the Previous Month" })
      .click();
  }
  await expect(selected).toHaveCount(1);
  await selected.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();

  await expect(trigger).toHaveAttribute("aria-label", before!);

  // Blurring or submitting is what raises "required", so do both, then wait
  // for the form to have said something about the field it does refuse.
  await trigger.focus();
  await trigger.blur();
  await dialog
    .locator("form")
    .getByRole("button", { name: "Record Vitals" })
    .click();
  await expect(
    page.locator('[data-slot="form-message"]').first(),
  ).toBeVisible();

  const message = page
    .locator('[data-slot="form-item"]')
    .filter({ has: trigger })
    .locator('[data-slot="form-message"]');
  await expect(message).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-label", before!);
  await expect(trigger).not.toHaveAttribute("aria-invalid", "true");
});
