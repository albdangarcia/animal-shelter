import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  fillStable,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// The create form's one happy path: the form sends what the action needs, the
// action saves it, and the new animal can be found on the list afterwards.
// What the save writes is proved in prisma/animal-creation.test.ts.

const adminPassword = process.env.ADMIN_PASSWORD;

const storageStatePath = storageStatePathFor("create-animal.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the create animal E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the picker, is
// the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

// Clicking before hydration makes the browser submit the form itself (a GET
// that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
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
// still closed. `option` null takes the first one offered.
const chooseFromSelect = async (
  page: Page,
  label: string,
  option: string | null,
) => {
  const options = page.getByRole("option");
  const choice =
    option === null
      ? options.first()
      : page.getByRole("option", { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      await page.getByLabel(label, { exact: true }).click();
    }
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
  await expect(options).toHaveCount(0);
};

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openCalendar = async (page: Page, label: RegExp) => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await page.getByRole("button", { name: label }).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

const toast = (page: Page, message: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message });

test("an animal created with the required fields is saved and listed", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Generated, so no spec that skips animals named elsewhere ever skips it.
  const name = `Created by form ${Date.now()}`;

  // Start on the list and reach the form through its link, so the save lands
  // back on the list without a page load, as it does for a user. The list's
  // data is not cached on the server, and Next fetches the list again on this
  // `router.push` back to it (`staleTimes.dynamic` defaults to 0). So this
  // passes without the action's `revalidatePath` today; it can catch a missing
  // one only when a cache entry from before the save would otherwise be reused.
  await page.goto("/dashboard/animals");
  const addAnimal = page.getByRole("link", { name: "Add Animal" });
  await expect
    .poll(() =>
      addAnimal.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
  // Dropped by any full page load, so it proves the journey stays in one.
  await page.evaluate(() => {
    (window as { sameDocument?: boolean }).sameDocument = true;
  });
  await addAnimal.click();
  await waitForPathname(page, "/dashboard/animals/create");
  await waitForFormHydration(page, "Create Intake");

  await fillStable(page.getByLabel("Animal Name *", { exact: true }), name);
  await chooseFromSelect(page, "Species *", null);
  await chooseFromSelect(page, "Breed *", null);
  await chooseFromSelect(page, "Primary Color *", null);
  // "Seize" needs no partner, person or address. The intake date defaults to
  // today.
  await chooseFromSelect(page, "Intake Type *", "Seize");
  // Any day on the grid the page opens on is not in its future.
  const birthCalendar = await openCalendar(page, /^Estimated Birth Date \*:/);
  await birthCalendar
    .locator("button[data-day]:not([disabled])")
    .nth(0)
    .click();
  await page.keyboard.press("Escape");
  await expect(birthCalendar).toBeHidden();

  await page.getByRole("button", { name: "Create Intake" }).click();

  await expect(
    toast(page, "Animal intake created successfully."),
  ).toBeVisible();
  await waitForPathname(page, "/dashboard/animals");

  // The list sorts newest first, so the new animal is on its first page.
  await expect(
    page.locator("tbody").getByRole("link", { name, exact: true }),
  ).toHaveAttribute("href", /^\/dashboard\/animals\/[^/]+$/);
  expect(
    await page.evaluate(
      () => (window as { sameDocument?: boolean }).sameDocument,
    ),
  ).toBe(true);
});
