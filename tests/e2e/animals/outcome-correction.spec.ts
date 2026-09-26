import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state — the better-auth
// sign-in endpoint rate-limits after a few hits inside a minute.
const storageStatePath = path.join(
  os.tmpdir(),
  "outcome-correction-admin.state.json",
);

test.describe.configure({ mode: "serial" });

const signIn = async (page: Page) => {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  const credentialsForm = page
    .locator("form")
    .filter({ has: page.getByLabel(/email address/i) });
  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill(adminPassword!);
  await credentialsForm.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
};

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the outcome correction E2E spec.",
    );
  }
  // storageState: undefined so this bootstrap context ignores the file-based
  // storageState set by test.use below (which does not exist yet).
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page);
  await context.storageState({ path: storageStatePath });
  await context.close();
});

test.use({ storageState: storageStatePath });

const TYPE_REFUSAL = "The outcome type can't be changed once an outcome is recorded.";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// react-hook-form applies its defaultValues after mount, which can land on top
// of an early fill() — re-fill until the value sticks.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

// Clicking submit before hydration makes the browser submit the form itself (a
// GET that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
const waitForFormHydration = async (
  page: Page,
  submitLabel = "Update Outcome",
) => {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: submitLabel }) });
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

const gotoOutcomeEdit = async (page: Page, editUrl: string) => {
  await page.goto(editUrl);
  await waitForFormHydration(page);
};

// The seed writes several outcomes of each type, newest first, so the first row
// under a type filter is stable for the whole run. Returns the animal's id and
// name, read off the row before it is left behind, and the edit page's URL.
const openFirstOutcomeEdit = async (page: Page, type: string) => {
  await page.goto(`/dashboard/outcomes?type=${type}`);
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();
  const animalLink = row.getByRole("link").first();
  const href = await animalLink.getAttribute("href");
  if (!href) {
    throw new Error(`No outcome row found for type=${type}`);
  }
  const animalName = (await animalLink.innerText()).trim();

  // The edit link sits behind a Radix row menu, which sometimes drops the first
  // click before hydration settles; re-clicking an open menu would shut it, so
  // click again only while it is still closed.
  const trigger = row.getByRole("button", { name: /open menu/i });
  const editItem = page.getByRole("menuitem", { name: "Edit" });
  await expect(async () => {
    if (!(await editItem.isVisible())) {
      await trigger.click();
    }
    await expect(editItem).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editItem.click();
  await page.waitForURL("**/dashboard/outcomes/*/edit", { timeout: 60_000 });
  const editUrl = page.url();
  await waitForFormHydration(page);

  return { animalId: href.split("/").pop() as string, animalName, editUrl };
};

const correctionRows = (page: Page) =>
  page.locator("li").filter({ hasText: "corrected an outcome" });

const gotoActivity = async (page: Page, animalId: string) => {
  // The text check below is the real readiness signal; waiting for the
  // window `load` event as well only adds a way for a stalled subresource to
  // time the test out after the server has already answered.
  await page.goto(`/dashboard/animals/${animalId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByText("most recent activity logs for this animal").first(),
  ).toBeVisible();
};

test("correcting an outcome logs who changed which fields", async ({ page }) => {
  const { animalId } = await openFirstOutcomeEdit(page, "TRANSFER_OUT");
  // The seed links only adoption outcomes to foster placements, so this one
  // ended none, and the date says nothing about a placement's end.
  await expect(
    page.getByText("This outcome ended a foster placement.", { exact: false }),
  ).toHaveCount(0);

  const partnerSelect = page.getByLabel(/destination partner/i);
  // The stored partner is what the select opens on; wait for it rather than
  // reading the placeholder.
  await expect(partnerSelect).toBeVisible();
  await expect(partnerSelect).not.toContainText(/select a partner/i);
  const previousPartner = (await partnerSelect.innerText()).trim();

  await partnerSelect.click();
  const other = page
    .getByRole("option")
    .filter({ hasNotText: new RegExp(`^${escapeRegExp(previousPartner)}$`) })
    .first();
  const nextPartner = (await other.innerText()).trim();
  await other.click();

  await fillStable(page.getByLabel("Notes"), `Corrected in E2E ${Date.now()}`);
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(page.getByText("Outcome updated successfully.")).toBeVisible();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });

  await gotoActivity(page, animalId);
  const row = correctionRows(page).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Admin User");

  // The feed is server-rendered; on a slow runner the first click can land
  // before React attaches the toggle handler. Retry until the panel sticks
  // open (the button text flips Show/Hide, so match either).
  const detail = row.locator(".details-box");
  await expect(async () => {
    if (!(await detail.isVisible())) {
      await row.getByRole("button", { name: /details/i }).click();
    }
    await expect(detail).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(detail).toContainText(
    `the destination partner changed from ${previousPartner} to ${nextPartner}`,
  );
  // "added" on a first run, "edited" when a retry finds the notes the first
  // attempt left behind — the database is not reset between retries.
  await expect(detail).toContainText(/notes were (added|edited)/);
  // Only the fields that moved are named.
  await expect(detail).not.toContainText("the date changed");
  await expect(detail).not.toContainText("the owner changed");
});

test("saving an outcome without changing anything writes no activity row", async ({
  page,
}) => {
  // Same first row as above; it now carries one correction, so compare a
  // before/after count rather than asserting an absolute zero.
  const { animalId, editUrl } = await openFirstOutcomeEdit(
    page,
    "TRANSFER_OUT",
  );
  await gotoActivity(page, animalId);
  const before = await correctionRows(page).count();

  await gotoOutcomeEdit(page, editUrl);
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(page.getByText("No changes to save.")).toBeVisible();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });

  await gotoActivity(page, animalId);
  await expect(correctionRows(page)).toHaveCount(before);
});

test("the server refuses a type change on an adoption outcome and leaves it linked", async ({
  page,
}) => {
  const { animalId, animalName, editUrl } = await openFirstOutcomeEdit(
    page,
    "ADOPTION",
  );
  await expect(page.getByLabel("Outcome Type")).toBeDisabled();
  await gotoActivity(page, animalId);
  const before = await correctionRows(page).count();
  await gotoOutcomeEdit(page, editUrl);

  // The select is disabled, so the form cannot send a different type. Rewrite
  // the outgoing action call so it does, the way any caller invoking the
  // server action directly could.
  let rewritten = false;
  await page.route("**/dashboard/outcomes/**", async (route) => {
    const request = route.request();
    const body = request.postData();
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      body?.includes('"outcomeType":"ADOPTION"')
    ) {
      rewritten = true;
      await route.continue({
        postData: body.replace(
          '"outcomeType":"ADOPTION"',
          '"outcomeType":"DECEASED"',
        ),
      });
      return;
    }
    await route.continue();
  });

  await fillStable(page.getByLabel("Notes"), `Retype attempt ${Date.now()}`);
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(page.getByText(TYPE_REFUSAL)).toBeVisible();
  expect(rewritten).toBe(true);
  await page.unroute("**/dashboard/outcomes/**");

  // Still an adoption, still pointing at its application: the recipient column
  // is derived from that link and reads N/A once it is gone.
  await page.goto(`/dashboard/outcomes?type=ADOPTION&query=${encodeURIComponent(animalName)}`);
  const row = page.locator("tbody tr").filter({ hasText: animalName }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Adoption");
  await expect(row).not.toContainText("N/A");

  // The refused attempt wrote nothing to the animal's history.
  await gotoActivity(page, animalId);
  await expect(correctionRows(page)).toHaveCount(before);
});

// react-day-picker stamps every day button with data-day, which is the only
// unambiguous handle: the visible text is just the day number, and the grid
// also renders the adjacent months' overflow days.
const dayCell = (calendar: Locator, date: Date) =>
  calendar.locator(`button[data-day="${date.toLocaleDateString("en-US")}"]`);

const outcomeDateTrigger = (page: Page) =>
  page.getByRole("button", { name: /^Date of Outcome \*:/ });

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openOutcomeCalendar = async (page: Page) => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await outcomeDateTrigger(page).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

// Re-selects the day the outcome is already stored under. Clicking the
// selected day is ignored (the field keeps its value on deselect), so this
// steps onto a neighbouring day and back — and the trip back hands the form a
// fresh local midnight rather than the instant on record, which is the only
// way to submit a date that reads the same but is not the same.
const repickStoredDay = async (page: Page) => {
  const selected = (await openOutcomeCalendar(page)).locator(
    'button[data-day][data-selected-single="true"]',
  );
  await expect(selected).toBeVisible();
  const storedDay = await selected.getAttribute("data-day");
  if (!storedDay) {
    throw new Error("The outcome date picker has no selected day.");
  }

  const [month, day, year] = storedDay.split("/").map(Number);
  // Stay inside the rendered month: an adjacent month's days are drawn as
  // outside days, and any day after today is refused by this field.
  const stored = new Date(year, month - 1, day);
  const neighbour = new Date(year, month - 1, day > 1 ? day - 1 : day + 1);

  await dayCell(await openOutcomeCalendar(page), neighbour).click();
  await dayCell(await openOutcomeCalendar(page), stored).click();
  await expect(outcomeDateTrigger(page)).toBeVisible();
};

test("re-picking the day the outcome is already on is not a correction", async ({
  page,
}) => {
  const { animalId, editUrl } = await openFirstOutcomeEdit(
    page,
    "TRANSFER_OUT",
  );
  await gotoActivity(page, animalId);
  const before = await correctionRows(page).count();

  await gotoOutcomeEdit(page, editUrl);
  await repickStoredDay(page);
  await page.getByRole("button", { name: "Update Outcome" }).click();

  // The submitted date is local midnight while the stored one carries a time,
  // but both read as the same day, so there is nothing to correct.
  await expect(page.getByText("No changes to save.")).toBeVisible();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });

  await gotoActivity(page, animalId);
  await expect(correctionRows(page)).toHaveCount(before);
});

test("a re-picked day is left out of the summary when another field changes", async ({
  page,
}) => {
  const { animalId, editUrl } = await openFirstOutcomeEdit(
    page,
    "TRANSFER_OUT",
  );

  await gotoOutcomeEdit(page, editUrl);
  await repickStoredDay(page);
  await fillStable(page.getByLabel("Notes"), `Re-picked day ${Date.now()}`);
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(page.getByText("Outcome updated successfully.")).toBeVisible();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });

  await gotoActivity(page, animalId);
  const row = correctionRows(page).first();
  await expect(row).toBeVisible();

  const detail = row.locator(".details-box");
  await expect(async () => {
    if (!(await detail.isVisible())) {
      await row.getByRole("button", { name: /details/i }).click();
    }
    await expect(detail).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(detail).toContainText("notes were edited");
  await expect(detail).not.toContainText("the date changed");
});

const personSearch = (page: Page) =>
  page.getByRole("combobox").filter({ hasText: "Search for a person..." });

test("the owner picker names the stored owner, and a save sends them back", async ({
  page,
}) => {
  // The recipient column names the owner on a return-to-owner outcome.
  await page.goto("/dashboard/outcomes?type=RETURN_TO_OWNER");
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();
  const owner = (
    await row.locator("td").nth(2).locator(".truncate").innerText()
  ).trim();

  await openFirstOutcomeEdit(page, "RETURN_TO_OWNER");

  // The form holds the owner, so the picker shows them rather than an empty
  // search box.
  await expect(page.getByText(owner, { exact: true })).toBeVisible();
  await expect(personSearch(page)).toHaveCount(0);

  // Nothing was touched, so the owner sent is the one on record.
  await page.getByRole("button", { name: "Update Outcome" }).click();
  await expect(page.getByText("No changes to save.")).toBeVisible();
});

test("a person chosen as the owner survives switching the outcome type away and back", async ({
  page,
}) => {
  await page.goto("/dashboard/animals?listingStatus=PUBLISHED&pageSize=10");
  const animalLink = page.locator("tbody tr").first().getByRole("link").first();
  await expect(animalLink).toBeVisible();
  const animalId = (await animalLink.getAttribute("href"))!.split("/").pop();

  // Nothing is submitted, so any animal on the shelter will do.
  await page.goto(`/dashboard/outcomes/create?animalId=${animalId}`);
  await waitForFormHydration(page, "Process Outcome");

  const chooseType = async (label: string) => {
    await page.getByLabel("Outcome Type").click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };

  await chooseType("Return To Owner");
  // An animal whose intake names a surrendering person starts on them; clear
  // that so the person below is one the user chose.
  const clear = page.getByRole("button", { name: "Clear" });
  await expect(clear.or(personSearch(page))).toBeVisible();
  if (await clear.isVisible()) {
    await clear.click();
  }
  await personSearch(page).click();
  await page.getByPlaceholder("Type a name, email, or phone...").fill("e");
  // Until the debounced search answers, the only option is "Add a new
  // person"; a person's option carries their name in a paragraph.
  const option = page
    .getByRole("option")
    .filter({ has: page.locator("p") })
    .first();
  await expect(option).toBeVisible();
  const chosen = (await option.locator("p").first().innerText()).trim();
  await option.click();
  await expect(page.getByText(chosen, { exact: true })).toBeVisible();

  await chooseType("Deceased");
  await expect(page.getByText(chosen, { exact: true })).toBeHidden();
  await chooseType("Return To Owner");
  await expect(page.getByText(chosen, { exact: true })).toBeVisible();
  await expect(personSearch(page)).toHaveCount(0);
});

test("the Processed By column sorts the outcomes list", async ({ page }) => {
  await page.goto("/dashboard/outcomes?pageSize=50");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Processed By" }).click();
  await page.getByRole("menuitem", { name: "Asc" }).click();
  await page.waitForURL(/sort=staffMember\.asc/);

  // The column before the row actions.
  const staffColumn = (await page.locator("thead th").count()) - 2;
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const names = await page
    .locator("tbody tr")
    .evaluateAll(
      (rows, index) =>
        rows.map((row) => row.querySelectorAll("td")[index].textContent ?? ""),
      staffColumn,
    );
  expect(names.length).toBeGreaterThan(1);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});
