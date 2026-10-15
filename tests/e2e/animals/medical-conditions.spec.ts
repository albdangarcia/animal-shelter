import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule for the problem list and care episodes is covered by the
// database tests (prisma/medical-conditions.test.ts, prisma/care-episodes.test.ts
// and prisma/care-status.test.ts). These are the journeys only a browser can
// show: that the Conditions page, a positive test and the housing board reach
// those rules, that the banner and readiness read what they record, and who
// sees which controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today is the shelter's today
// rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medical-conditions-staff.state.json");
const volunteerStatePath = storageStatePathFor(
  "medical-conditions-volunteer.state.json",
);

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffStatePath,
  });
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerStatePath,
  });
});

const animalId = (page: Page, name: string) =>
  firstRowIdByQuery(page, "/dashboard/animals", name);

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. Each test reads
// today once, at its start, and picks that day in every day field rather
// than keeping the form's default: a form defaults to the server's today when
// it opens, which is the next day if the test runs across the shelter's
// midnight. The helpers below are the ones in medical-exams.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

// The app prints a day as "Feb 1, 2026". Read at midnight UTC, so the key
// cannot slip a day.
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// data-day is the browser's en-US short date: M/D/YYYY, no padding.
const dataDayOf = (day: DayKey) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${month}/${date}/${year}`;
};

const monthOf = (dataDay: string) => {
  const [month, , year] = dataDay.split("/").map(Number);
  return year * 12 + month;
};

const calendarOf = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.locator("button[data-day]") });

/**
 * Picks `day` in the day picker `trigger` opens, stepping to the day's month
 * if the calendar opens on another. The calendar stays open after a pick, so
 * Escape closes it. A required field keeps its day when that day is picked
 * again, so picking the day already shown is safe.
 */
const pickDay = async (page: Page, trigger: Locator, day: DayKey) => {
  const calendar = calendarOf(page);
  await expect(async () => {
    if (!(await calendar.isVisible())) await trigger.click();
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const cell = calendar.locator(`button[data-day="${dataDayOf(day)}"]`);
  for (let step = 0; !(await cell.isVisible()); step++) {
    if (step > 24) {
      throw new Error(`The calendar never reached ${printedDay(day)}.`);
    }
    const shown = await calendar
      .locator("button[data-day]")
      .nth(15)
      .getAttribute("data-day");
    const back = monthOf(dataDayOf(day)) < monthOf(shown ?? "");
    await calendar
      .getByRole("button", {
        name: back ? "Go to the Previous Month" : "Go to the Next Month",
      })
      .click();
  }
  await cell.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
};

/**
 * Opens a Radix menu and picks an item. The trigger can swallow the first
 * click before hydration settles, so retry, re-clicking only while the menu
 * is closed.
 */
const pickFromMenu = async (page: Page, trigger: Locator, itemName: RegExp | string) => {
  const item = page.getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await item.click();
};

/** Opens the dialog a button opens, retrying a click lost to hydration. */
const openDialog = async (trigger: Locator, dialog: Locator) => {
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

const chooseOption = async (page: Page, combobox: Locator, option: RegExp | string) => {
  await combobox.click();
  await page.getByRole("option", { name: option }).click();
};

/** The readiness panel on the animal's Activity tab. */
const readinessPanel = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: "still outstanding before this animal is fully ready" });

/** The banner's care lines on the animal page. */
const careAlerts = (page: Page) => page.getByRole("group", { name: "Care alerts" });

/** The Overview's alerts. */
const overviewAlerts = (page: Page) => page.getByRole("region", { name: "Alerts" });

/** The Conditions page's two cards. */
const problemList = (page: Page) =>
  page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "Problem list" }),
  });
const careEpisodes = (page: Page) =>
  page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "Care episodes" }),
  });

/** Live rows (ones with a menu) whose text holds `marker`. */
const liveRowsWith = (scope: Locator, marker: string) =>
  scope
    .locator("li[aria-label]")
    .filter({ hasText: marker })
    .filter({ has: scope.page().getByRole("button", { name: /^Actions for / }) });

/**
 * Voids every live row of a list `marker` finds, reloading after each void
 * since the list streams in again. `loaded` waits for the list itself, which
 * the loading skeleton doesn't have.
 */
const voidLeftovers = async (
  page: Page,
  url: string,
  rows: () => Locator,
  loaded: () => Promise<void>,
  confirmLabel: string,
) => {
  await page.goto(url);
  await loaded();
  while ((await rows().count()) > 0) {
    await pickFromMenu(
      page,
      rows().first().getByRole("button", { name: /^Actions for / }),
      /^Void/,
    );
    const voidDialog = page.getByRole("alertdialog");
    await voidDialog
      .getByLabel("Reason for voiding")
      .fill("Left by an earlier attempt of this test.");
    await voidDialog.getByRole("button", { name: confirmLabel, exact: true }).click();
    await expect(voidDialog).toBeHidden();
    await page.goto(url);
    await loaded();
  }
};

/**
 * The animal's traits on its Characteristics tab, once loaded: the loading
 * skeleton has the same title and description, but no Edit button. While the
 * page streams in, React also holds a hidden copy, so only the shown one
 * counts.
 */
const characteristicsCard = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByText("Unique behavioral and medical traits for this animal."),
    })
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true }) })
    .filter({ visible: true });

/** Takes `trait` off the animal by hand, if it carries it. */
const removeTrait = async (page: Page, animalPath: string, trait: string) => {
  await page.goto(`${animalPath}/characteristics`);
  const card = characteristicsCard(page);
  await expect(card).toBeVisible();
  const badge = card.getByText(trait, { exact: true });
  if ((await badge.count()) === 0) return;
  const dialog = page.getByRole("dialog", { name: "Edit Characteristics" });
  await openDialog(card.getByRole("button", { name: "Edit", exact: true }), dialog);
  await dialog.getByRole("button", { name: `Remove ${trait}` }).click();
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(badge).toHaveCount(0);
};

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("an allergy, a condition found on a positive test, and the trait it stands for", async ({
    page,
  }, testInfo) => {
    const today = todayIn(SHELTER_ZONE);
    // A retry or a repeat runs against the database an earlier attempt wrote
    // to, so each attempt marks the notes of what it writes. Buddy is a
    // hand-authored dog whose medical record, traits and readiness no other
    // spec reads.
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Conditions journey";
    const id = await animalId(page, "Buddy");
    const activity = `/dashboard/animals/${id}`;
    const overview = `${activity}/medical`;
    const conditions = `${overview}/conditions`;
    const trait = "Heartworm Positive";
    const conditionName = "Heartworm antigen positive";

    // Start by voiding what an earlier attempt left (its allergy, its
    // condition and its test), and taking the trait off, so the animal reads
    // as the seed left it.
    await voidLeftovers(
      page,
      conditions,
      () => liveRowsWith(problemList(page), marker),
      () => expect(problemList(page)).toBeVisible(),
      "Void",
    );
    await voidLeftovers(
      page,
      `${overview}/history?kind=TEST`,
      () => liveRowsWith(page.locator("main"), marker),
      () => expect(page.getByRole("button", { name: /^Kind/ })).toBeVisible(),
      "Void Entry",
    );
    await removeTrait(page, activity, trait);

    // Add an allergy: the banner and Overview's alerts name it.
    await page.goto(conditions);
    const addAllergy = page.getByRole("dialog", { name: "Add an allergy" });
    await openDialog(page.getByRole("button", { name: "Add allergy" }), addAllergy);
    await addAllergy.getByRole("textbox", { name: /^Allergic to/ }).fill("Chicken");
    await addAllergy
      .getByLabel("Notes", { exact: true })
      .fill(`${marker}: allergy, attempt ${attempt}.`);
    await addAllergy.getByRole("button", { name: "Add Allergy" }).click();
    await expect(addAllergy).toBeHidden();
    await expect(
      problemList(page).locator('li[aria-label="Chicken, allergy"]'),
    ).toBeVisible();

    await page.goto(activity);
    await expect(careAlerts(page)).toContainText("Allergy: Chicken");
    await page.goto(overview);
    await expect(
      overviewAlerts(page).getByRole("link", { name: "Allergy: Chicken" }),
    ).toHaveAttribute("href", conditions);

    // Record a heartworm test in house today, positive. The condition found
    // on it starts on its day.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Test");
    const testForm = page.getByRole("dialog", { name: "Record a test" });
    await chooseOption(page, testForm.getByRole("combobox", { name: /^Test/ }), "Heartworm antigen");
    await pickDay(page, testForm.getByRole("button", { name: /^Date given \*:/ }), today);
    await chooseOption(
      page,
      testForm.getByRole("combobox", { name: "Heartworm antigen", exact: true }),
      "Positive",
    );
    // The test repeats yearly, so recording may offer to schedule the next
    // one. This journey is about what the result finds.
    const scheduleNext = testForm.getByRole("checkbox", { name: "Schedule the next one" });
    if (await scheduleNext.isVisible()) await scheduleNext.uncheck();
    await testForm
      .getByLabel("Notes", { exact: true })
      .fill(`${marker}: test, attempt ${attempt}.`);
    await testForm.getByRole("button", { name: "Record Test" }).click();
    await expect(testForm).toBeHidden();

    // The positive test offers to put it on the problem list, named for the
    // result and found on the test; the condition names the trait.
    const testRow = page
      .getByRole("region", { name: "Recent entries" })
      .locator("li[aria-label]")
      .filter({ hasText: `test, attempt ${attempt}` });
    const addCondition = page.getByRole("dialog", { name: "Add a condition" });
    await openDialog(
      testRow.getByRole("button", { name: "Add to problem list" }),
      addCondition,
    );
    await expect(addCondition.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      conditionName,
    );
    await expect(addCondition.getByRole("combobox", { name: "Found on" })).toContainText(
      `Heartworm antigen test of ${printedDay(today)}`,
    );
    await chooseOption(
      page,
      addCondition.getByRole("combobox", { name: "Medical trait it stands for" }),
      trait,
    );
    await addCondition
      .getByLabel("Notes", { exact: true })
      .fill(`${marker}: condition, attempt ${attempt}.`);
    await addCondition.getByRole("button", { name: "Add Condition" }).click();
    await expect(addCondition).toBeHidden();

    // On the problem list, the condition offers its trait; added, the trait
    // cites it on the Characteristics tab.
    await page.goto(conditions);
    const condition = problemList(page)
      .locator(`li[aria-label="${conditionName}, condition"]`)
      .filter({ hasText: `condition, attempt ${attempt}` });
    await expect(condition).toContainText(
      `Found on the Heartworm antigen test of ${printedDay(today)}`,
    );
    await expect(condition).toContainText(`Stands for the trait: ${trait}`);
    await condition.getByRole("button", { name: `Add ${trait} to the animal` }).click();
    await expect(condition).toContainText("on the animal, citing this condition");
    await expect(
      condition.getByRole("button", { name: `Add ${trait} to the animal` }),
    ).toHaveCount(0);

    await page.goto(`${activity}/characteristics`);
    const traitLine = characteristicsCard(page)
      .locator("div")
      .filter({ has: page.getByText(trait, { exact: true }) })
      .last();
    await expect(traitLine).toContainText(`from the condition ${conditionName}`);
    await expect(traitLine.getByRole("link", { name: conditionName })).toHaveAttribute(
      "href",
      conditions,
    );

    // Resolved, the condition no longer supports the trait: readiness says
    // so.
    await page.goto(conditions);
    await pickFromMenu(
      page,
      condition.getByRole("button", { name: `Actions for ${conditionName} (condition)` }),
      "Resolve",
    );
    const resolve = page.getByRole("dialog", {
      name: `Resolve ${conditionName} (condition)`,
    });
    await pickDay(page, resolve.getByRole("button", { name: /^Resolved date \*:/ }), today);
    await resolve.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(resolve).toBeHidden();
    await expect(condition).toContainText(`Resolved ${printedDay(today)}`);

    await page.goto(activity);
    const panel = readinessPanel(page);
    await expect(panel).toContainText(`${trait} — its condition was resolved`);
    await expect(
      panel
        .locator("li")
        .filter({ hasText: trait })
        .getByRole("link", { name: "Review characteristics" }),
    ).toHaveAttribute("href", `${activity}/characteristics`);

    // Void it: History's Condition filter shows it struck through.
    await page.goto(conditions);
    await pickFromMenu(
      page,
      condition.getByRole("button", { name: `Actions for ${conditionName} (condition)` }),
      /^Void/,
    );
    const voidDialog = page.getByRole("alertdialog", {
      name: `Void ${conditionName} (condition)?`,
    });
    await voidDialog.getByLabel("Reason for voiding").fill("Recorded in a test journey.");
    await voidDialog.getByRole("button", { name: "Void", exact: true }).click();
    await expect(voidDialog).toBeHidden();

    await page.goto(activity);
    await expect(panel).toContainText(`${trait} — cites a voided condition`);

    await page.goto(`${overview}/history?kind=CONDITION`);
    const voided = page
      .locator(`li[aria-label="${conditionName}, condition, voided"]`)
      .filter({ hasText: `condition, attempt ${attempt}` });
    await expect(voided).toHaveCount(1);
    await expect(voided.getByText(conditionName, { exact: true })).toHaveClass(
      /line-through/,
    );
    await expect(voided).toContainText("Voided by Olivia Chen");
    await expect(voided.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
    // Only conditions are listed: the allergy too, not the test.
    await expect(
      page.locator('li[aria-label="Chicken, allergy"]').filter({ hasText: `attempt ${attempt}` }),
    ).toHaveCount(1);
    await expect(
      page.locator("li[aria-label]").filter({ hasText: `test, attempt ${attempt}` }),
    ).toHaveCount(0);

    // Take the trait off again, so the animal's readiness is as it was.
    await removeTrait(page, activity, trait);
    await page.goto(activity);
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText(trait);
  });

  test("moving an animal into a medical unit opens a stay in house, and moving it out closes it", async ({
    page,
  }, testInfo) => {
    const today = todayIn(SHELTER_ZONE);
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Episode journey";
    // Buddy lives in Dog block A's A-3, and no other spec moves him.
    const id = await animalId(page, "Buddy");
    const activity = `/dashboard/animals/${id}`;
    const conditions = `${activity}/medical/conditions`;
    const stay = `Hospitalised in house since ${printedDay(today)}`;

    const board = () => page.getByRole("region", { name: "Housing board" });
    const tile = (unit: string, location: string) =>
      board().getByRole("group", { name: `${unit} in ${location}`, exact: true });
    const home = () => tile("A-3", "Dog block A");
    // MED-2 holds few enough animals that Buddy's chip shows, not behind
    // "+N more".
    const ward = () => tile("MED-2", "Medical wing");
    const chipIn = (unit: Locator) =>
      unit
        .getByRole("button", { name: "Buddy", exact: true })
        .and(page.locator('[aria-roledescription="draggable"]'));
    const offer = page.getByRole("dialog");
    // Tall enough that both units are on screen at once, as a pointer drag
    // needs.
    await page.setViewportSize({ width: 1280, height: 2400 });

    /** Drags Buddy's chip onto `to`, pressing and moving as a pointer does. */
    const dragBuddy = async (from: Locator, to: Locator) => {
      const chip = chipIn(from);
      await expect(chip).toBeVisible();
      await chip.scrollIntoViewIfNeeded();
      const start = await chip.boundingBox();
      const end = await to.boundingBox();
      const viewport = page.viewportSize();
      if (!start || !end || !viewport || end.y < 0 || end.y + end.height > viewport.height) {
        throw new Error("The chip and the unit aren't on screen together.");
      }
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      // Past the board's 4px activation distance, then over the unit.
      await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2 + 10, {
        steps: 5,
      });
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 });
      await page.mouse.up();
      await expect(chipIn(to)).toBeVisible();
    };

    // Start by voiding what an earlier attempt left, open or closed, then
    // putting Buddy back in A-3, with nothing written if a move offers.
    await voidLeftovers(
      page,
      conditions,
      () => liveRowsWith(careEpisodes(page), marker),
      () => expect(careEpisodes(page)).toBeVisible(),
      "Void",
    );
    await page.goto("/dashboard/locations");
    await expect(board()).toBeVisible();
    if ((await chipIn(home()).count()) === 0) {
      const from = board()
        .getByRole("group")
        .filter({ has: page.getByRole("button", { name: "Buddy", exact: true }) })
        .last();
      await dragBuddy(from, home());
      if (await offer.isVisible()) {
        await offer.getByRole("button", { name: "Not now" }).click();
        await expect(offer).toBeHidden();
      }
    }

    // Into the Medical wing: the move is saved, and offers a stay in house
    // from today.
    await dragBuddy(home(), ward());
    const openOffer = page.getByRole("dialog", {
      name: "Buddy is now in Medical wing · MED-2. Open a care episode?",
    });
    await expect(openOffer).toBeVisible();
    await expect(
      openOffer
        .getByRole("radiogroup", { name: /^Kind of care/ })
        .getByRole("radio", { name: /^Hospitalised in house/ }),
    ).toBeChecked();
    await pickDay(page, openOffer.getByRole("button", { name: /^Start date \*:/ }), today);
    await openOffer
      .getByRole("textbox", { name: /^Reason/ })
      .fill(`${marker}: observation, attempt ${attempt}.`);
    await openOffer.getByRole("button", { name: "Open Episode" }).click();
    await expect(openOffer).toBeHidden();

    // The banner and readiness read the open stay.
    await page.goto(activity);
    await expect(careAlerts(page)).toContainText(stay);
    const panel = readinessPanel(page);
    const underCare = panel.locator("li").filter({ hasText: stay });
    await expect(underCare).toHaveCount(1);
    await expect(underCare.getByRole("link", { name: "View care episode" })).toHaveAttribute(
      "href",
      conditions,
    );

    // Back to A-3: the move offers to close the stay today.
    await page.goto("/dashboard/locations");
    await dragBuddy(ward(), home());
    const closeOffer = page.getByRole("dialog", {
      name: `Close Buddy's care episode (hospitalised in house since ${printedDay(today)})?`,
    });
    await expect(closeOffer).toBeVisible();
    await pickDay(page, closeOffer.getByRole("button", { name: /^End date \*:/ }), today);
    await closeOffer.getByRole("button", { name: "Close Episode" }).click();
    await expect(closeOffer).toBeHidden();

    // Closed: readiness's item is gone, and the episode reads as over.
    await page.goto(activity);
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("Hospitalised in house");
    // The banner has no care lines at all unless something else is on record.
    await expect(careAlerts(page).filter({ hasText: "Hospitalised in house" })).toHaveCount(0);
    await page.goto(conditions);
    await expect(
      careEpisodes(page)
        .locator("li[aria-label]")
        .filter({ hasText: `observation, attempt ${attempt}` }),
    ).toHaveAttribute(
      "aria-label",
      `Hospitalised in house, ${printedDay(today)} to ${printedDay(today)}`,
    );
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads the problem list, the care episode and the alerts, with no controls to change anything", async ({
    page,
  }) => {
    // Fido is hospitalised in house for heartworm, found on a test at the
    // clinic, a condition standing for a trait he doesn't carry yet.
    const id = await animalId(page, "Fido");
    const activity = `/dashboard/animals/${id}`;
    const conditions = `${activity}/medical/conditions`;

    await page.goto(conditions);
    const condition = problemList(page).locator(
      'li[aria-label="Heartworm disease, condition"]',
    );
    await expect(condition).toContainText("Found on the Heartworm antigen test of");
    await expect(condition).toContainText("Stands for the trait: Heartworm Positive");
    await expect(
      careEpisodes(page).locator("li[aria-label^='Hospitalised in house since ']"),
    ).toHaveCount(1);

    for (const name of [
      "Add condition",
      "Add allergy",
      "Open care episode",
      "Close episode",
      "Add Heartworm Positive to the animal",
      "Cite this condition",
      /^Actions for /,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }

    await page.goto(activity);
    await expect(careAlerts(page)).toContainText(/Hospitalised in house since /);

    await page.goto(`${activity}/medical`);
    const alerts = overviewAlerts(page);
    await expect(alerts.getByRole("link", { name: "Heartworm disease (active)" })).toHaveAttribute(
      "href",
      conditions,
    );
    await expect(
      alerts.getByRole("link", { name: /^Hospitalised in house since / }),
    ).toHaveAttribute("href", conditions);
  });
});
