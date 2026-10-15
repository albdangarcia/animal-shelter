import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  fillStable,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// Every rule for protocols is covered by the database tests
// (prisma/medical-protocols.test.ts, prisma/medical-protocol-application.test.ts,
// and the creation and re-intake tests), and the plan by its unit tests. These
// are the journeys only a browser can show: that the settings page reaches
// the protocol rules and puts each refusal under its field, that the editor
// holds still while a save is out, and that the intake forms show the plan the
// server then applies, which the animal's Medical tab and feed read back.

test.describe.configure({ mode: "serial" });

const adminPassword = process.env.ADMIN_PASSWORD;

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today is the shelter's today
// rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

const storageStatePath = storageStatePathFor("medical-protocols.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the medical protocols E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The admin holds every medical permission, so the intake forms show the plan.
test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

const PROTOCOLS_PATH = "/dashboard/settings/medical/protocols";

// The names of the puppies the intake journey creates.
const PUPPY_PREFIX = "Protocol puppy";

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. Each test reads
// today once, at its start, and picks that day in every day field rather
// than keeping the form's default: a form defaults to the server's today when
// it opens, which is the next day if the test runs across the shelter's
// midnight. The helpers below are the ones in medical-conditions.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

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

/**
 * Picks `option` in a Radix select. A click that lands before hydration
 * settles can be dropped, and re-clicking an open select would shut it, so
 * click again only while it is still closed. `option` null takes the first.
 */
const chooseOption = async (
  page: Page,
  combobox: Locator,
  option: RegExp | string | null,
) => {
  const options = page.getByRole("option");
  const choice =
    option === null
      ? options.first()
      : page.getByRole("option", { name: option, exact: typeof option === "string" });
  await expect(async () => {
    if (!(await choice.isVisible())) await combobox.click();
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
  await expect(options).toHaveCount(0);
};

// Clicking submit before hydration makes the browser submit the form itself
// (a GET that appends the fields to the URL) and nothing reaches the action.
// React marks each DOM node it has attached to, so wait for that on the form.
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

const toast = (page: Page, message: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message });

/**
 * The message under the form field in `scope` holding `control`, a locator
 * from the page, as a `has` filter reads it inside each field.
 */
const messageUnder = (scope: Locator, control: Locator) =>
  scope
    .locator('[data-slot="form-item"]')
    .filter({ has: control })
    .locator('[data-slot="form-message"]');

const withDb = async <T>(run: (client: pg.Client) => Promise<T>) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

/**
 * Holds back the server actions `page` sends to `pathname` until `release`
 * is called, so a test can look at a form while its save is out. Only the
 * actions are held; page loads go through.
 */
const holdActions = async (page: Page, pathname: string) => {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held = 0;
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      held += 1;
      await gate;
    }
    await route.fallback();
  };
  const matches = (url: URL) => url.pathname === pathname;
  await page.route(matches, handler);
  return {
    heldCount: () => held,
    release: async () => {
      open();
      await page.unroute(matches, handler);
    },
  };
};

/**
 * Waits two frames, so whatever the last key or press changes has been
 * rendered before a test checks that it changed nothing.
 */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

/** The animal's activity feed, newest first. */
const activityFeed = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: "most recent activity logs for this animal" })
    .locator("li")
    .filter({ hasText: /\S/ });

/** The plan an intake form shows: "Puppy protocol: 15 entries". */
const protocolPreview = (page: Page) =>
  page.getByRole("region", { name: "Medical Protocol" });

/**
 * Reads the preview's headline: the protocol it names ("Puppy protocol") and
 * how many entries it will schedule.
 */
const readPreview = async (page: Page) => {
  const headline = protocolPreview(page).locator("p").first();
  await expect(headline).toHaveText(/^.+ protocol: \d+ entr(y|ies)$/);
  const [, title, count] =
    (await headline.textContent())?.match(/^(.+ protocol): (\d+) entr/) ?? [];
  return { title, count: Number(count) };
};

/**
 * The rows of the Overview's Due list that say they came from `title`, on
 * a line of their own: matched exactly, since a row's change history says
 * "Scheduled from the …" too.
 */
const dueRowsFrom = (page: Page, title: string) =>
  page
    .getByRole("region", { name: "Due" })
    .locator("li[aria-label]")
    .filter({ has: page.getByText(`From the ${title}`, { exact: true }) });

test("an admin adds a protocol, is refused an overlap under its field, edits a step and retires it", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // Rabbits have no seeded protocol. A retry or a repeat runs against the
  // database an earlier attempt wrote to, and names are unique among retired
  // protocols too, so each attempt's name carries its marker.
  const marker = "Rabbit journey";
  const name = `${marker} ${testInfo.retry}-${testInfo.repeatEachIndex}-${Date.now()}`;
  const rabbits = () => page.getByRole("region", { name: "Rabbit", exact: true });
  const row = () => rabbits().locator("li").filter({ hasText: name }).first();
  const actionsFor = (protocol: string) =>
    page.getByRole("button", { name: `Actions for ${protocol}`, exact: true });

  // Start by retiring what an earlier attempt left live, so its rabbits'
  // ages are free again. A retired one's menu offers only Unretire.
  await page.goto(PROTOCOLS_PATH);
  await expect(page.getByRole("button", { name: "Add Protocol" })).toBeVisible();
  const leftovers = page.getByRole("button", {
    name: new RegExp(`^Actions for ${marker} `),
  });
  for (const trigger of await leftovers.all()) {
    const menu = page.getByRole("menu");
    await expect(async () => {
      if (!(await menu.isVisible())) await trigger.click();
      await expect(menu).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const retire = menu.getByRole("menuitem", { name: "Retire", exact: true });
    if (await retire.isVisible()) {
      await retire.click();
      await expect(toast(page, "Protocol retired.")).toBeVisible();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(menu).toBeHidden();
  }

  // Add Protocol, closed unchanged, hands focus back to its button.
  const addButton = page.getByRole("button", { name: "Add Protocol" });
  const addDialog = page.getByRole("dialog", { name: "Add Protocol" });
  await openDialog(addButton, addDialog);
  await page.keyboard.press("Escape");
  await expect(addDialog).toBeHidden();
  await expect(addButton).toBeFocused();

  // A new protocol starts with an intake exam. A DHPP step picked for dogs
  // stays on the form when the species becomes rabbits, so the server
  // refuses it.
  await openDialog(addButton, addDialog);
  await fillStable(addDialog.getByLabel("Name *", { exact: true }), name);
  const speciesSelect = addDialog.getByRole("combobox", { name: /^Species/ });
  await chooseOption(page, speciesSelect, "Dog");
  await expect(addDialog.getByRole("group", { name: "Step 1: Intake exam" })).toBeVisible();
  await addDialog.getByRole("button", { name: "Add step" }).click();
  const secondStep = addDialog.getByRole("group", { name: /^Step 2: / });
  await chooseOption(page, secondStep.getByRole("combobox", { name: /^Vaccine/ }), "DHPP");
  await expect(secondStep).toHaveAccessibleName("Step 2: DHPP");
  await chooseOption(page, speciesSelect, "Rabbit");
  await expect(secondStep.getByRole("combobox", { name: /^Vaccine/ })).toContainText(
    "DHPP (not for rabbits)",
  );

  // While the save is out nothing on the form changes: its refusal is keyed
  // by the step's place in the list. Escape doesn't close the dialog, the
  // selects don't open on a press, and the steps can't move.
  const held = await holdActions(page, PROTOCOLS_PATH);
  await addDialog.getByRole("button", { name: "Create Protocol" }).click();
  await expect.poll(held.heldCount).toBe(1);
  await expect(addDialog.getByRole("button", { name: "Creating..." })).toBeDisabled();
  await page.keyboard.press("Escape");
  await nextFrames(page);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(addDialog).toBeVisible();
  const kindSelect = secondStep.getByRole("combobox", { name: /^Kind/ });
  await expect(kindSelect).toBeDisabled();
  await kindSelect.click({ force: true });
  await expect(speciesSelect).toBeDisabled();
  await speciesSelect.click({ force: true });
  await nextFrames(page);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(secondStep.getByRole("button", { name: "Move DHPP step up" })).toBeDisabled();
  await held.release();

  await expect(
    messageUnder(secondStep, page.getByRole("combobox", { name: /^Vaccine/ })),
  ).toHaveText("DHPP isn't for rabbits.");
  await expect(addDialog).toBeVisible();

  // As a Fecal flotation test, which suits every species, it saves.
  await chooseOption(page, kindSelect, "Test");
  await chooseOption(
    page,
    secondStep.getByRole("combobox", { name: /^Test/ }),
    "Fecal flotation",
  );
  await addDialog.getByRole("button", { name: "Create Protocol" }).click();
  await expect(addDialog).toBeHidden();
  await expect(toast(page, `${name} protocol added.`)).toBeVisible();
  await expect(row()).toContainText("Rabbits of every age");
  await expect(row()).toContainText("Intake exam · at intake");
  await expect(row()).toContainText("Fecal flotation · at intake");

  // A second live protocol for rabbits from birth overlaps it, and is
  // refused under its age.
  await openDialog(addButton, addDialog);
  await fillStable(addDialog.getByLabel("Name *", { exact: true }), `${name} young`);
  await chooseOption(page, addDialog.getByRole("combobox", { name: /^Species/ }), "Rabbit");
  const fromAge = page.getByLabel("From age (days)", { exact: true });
  await fillStable(addDialog.locator(fromAge), "0");
  await addDialog.getByRole("button", { name: "Create Protocol" }).click();
  await expect(messageUnder(addDialog, fromAge)).toHaveText(
    `${name} already covers rabbits at every age.`,
  );
  await addDialog.getByRole("button", { name: "Cancel" }).click();
  const discard = page.getByRole("alertdialog", { name: "Discard unsaved protocol?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Discard" }).click();
  await expect(discard).toBeHidden();
  await expect(addDialog).toBeHidden();
  // Both dialogs gone, focus is back on the button that opened the form.
  await expect(addButton).toBeFocused();
  await expect(rabbits().locator("li").filter({ hasText: `${name} young` })).toHaveCount(0);

  // Edit the test step to come three days after intake.
  await pickFromMenu(page, actionsFor(name), "Edit");
  const editDialog = page.getByRole("dialog", { name: `Edit ${name}` });
  await expect(editDialog).toBeVisible();
  const fecalStep = editDialog.getByRole("group", { name: "Step 2: Fecal flotation" });
  await fillStable(fecalStep.getByLabel("Days after intake *", { exact: true }), "3");
  await editDialog.getByRole("button", { name: "Update Protocol" }).click();
  await expect(editDialog).toBeHidden();
  await expect(row()).toContainText("Fecal flotation · 3 days after intake");
  await expect(row()).not.toContainText("Fecal flotation · at intake");
  await expect(actionsFor(name)).toBeFocused();

  // Retired meanwhile by another admin, this page's Retire is refused, and
  // the row then shows it as it is, offering Unretire.
  const other = await page.context().newPage();
  await other.goto(PROTOCOLS_PATH);
  await pickFromMenu(
    other,
    other.getByRole("button", { name: `Actions for ${name}`, exact: true }),
    /^Retire$/,
  );
  await expect(toast(other, "Protocol retired.")).toBeVisible();
  await other.close();

  await pickFromMenu(page, actionsFor(name), /^Retire$/);
  await expect(toast(page, "This protocol is already retired.")).toBeVisible();
  await expect(row()).toContainText("Retired");
  await pickFromMenu(page, actionsFor(name), /^Unretire$/);
  await expect(toast(page, "Protocol unretired.")).toBeVisible();
  await expect(row()).not.toContainText("Retired");
  // Retired again, as the test leaves it.
  await pickFromMenu(page, actionsFor(name), /^Retire$/);
  await expect(toast(page, "Protocol retired.")).toBeVisible();
  await expect(row()).toContainText("Retired");
});

test("a puppy created through the form gets the protocol it was shown, unless the box is unticked", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const today = todayIn(SHELTER_ZONE);
  // Sixty days old: a puppy for the seeded protocols, old enough for its
  // first DHPP and Bordetella today, too young for rabies.
  const birthDay = shiftDay(today, -60);
  const stamp = Date.now();

  /** Fills the create form for a male puppy born on `birthDay`, arriving today. */
  const fillPuppy = async (name: string) => {
    await page.goto("/dashboard/animals/create");
    await waitForFormHydration(page, "Create Intake");
    await fillStable(page.getByLabel("Animal Name *", { exact: true }), name);
    await chooseOption(page, page.getByLabel("Species *", { exact: true }), "Dog");
    await chooseOption(page, page.getByLabel("Breed *", { exact: true }), null);
    await chooseOption(page, page.getByLabel("Primary Color *", { exact: true }), null);
    // "Seize" needs no partner, person or address.
    await chooseOption(page, page.getByLabel("Intake Type *", { exact: true }), "Seize");
    await pickDay(page, page.getByRole("button", { name: /^Estimated Birth Date \*:/ }), birthDay);
    await pickDay(page, page.getByRole("button", { name: /^Intake Date \*:/ }), today);
  };

  // The plan follows the form: with no sex given there is no spay or neuter;
  // a male gets a neuter.
  const name = `${PUPPY_PREFIX} ${stamp}`;
  await fillPuppy(name);
  const preview = protocolPreview(page);
  await expect(preview).toContainText("Not scheduled: spay/neuter (sex unknown)");
  const unknownSex = await readPreview(page);
  expect(unknownSex.title).toBe("Puppy protocol");
  await chooseOption(page, page.getByLabel("Sex *", { exact: true }), "Male");
  await expect(preview).not.toContainText("spay/neuter (sex unknown)");
  await expect(preview.locator("li").filter({ hasText: /^Neuter: / })).toHaveCount(1);
  await expect(preview.locator("li").filter({ hasText: /^DHPP: / })).toHaveCount(1);
  const { count } = await readPreview(page);
  expect(count).toBe(unknownSex.count + 1);
  await expect(
    preview.getByRole("checkbox", { name: "Schedule this protocol's care" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Create Intake" }).click();
  await expect(
    toast(
      page,
      `Animal intake created successfully. Puppy protocol: ${count} entries scheduled.`,
    ),
  ).toBeVisible();
  await waitForPathname(page, "/dashboard/animals");

  // Its Medical Overview lists what the preview promised, each from the
  // protocol; the feed has one row for it, and none per entry.
  const link = page.locator("tbody").getByRole("link", { name, exact: true });
  const animalPath = await link.getAttribute("href");
  await page.goto(`${animalPath}/medical`);
  await expect(dueRowsFrom(page, "Puppy protocol")).toHaveCount(count);
  await expect(page.getByRole("region", { name: "Due" }).locator("li[aria-label]")).toHaveCount(
    count,
  );

  await page.goto(`${animalPath}`);
  const feed = activityFeed(page);
  await expect(feed.first()).toContainText("applied a medical protocol");
  await expect(feed.filter({ hasText: "applied a medical protocol" })).toHaveCount(1);
  await feed.first().getByRole("button", { name: "Show details" }).click();
  // The first care is due on the server's today when it saved, which is the
  // day after the one read here if the shelter's midnight fell in between.
  // At sixty days old the count is the same either way.
  const firstDays = [today, shiftDay(today, 1)].map(printedDay).join("|");
  await expect(feed.first()).toContainText(
    new RegExp(
      `Puppy protocol applied: ${count} entries scheduled, (${firstDays}) to `,
    ),
  );
  await expect(feed.filter({ hasText: "scheduled a medical entry" })).toHaveCount(0);

  // Unticked, the same puppy gets nothing from it.
  const skipped = `${PUPPY_PREFIX} ${stamp} unticked`;
  await fillPuppy(skipped);
  await chooseOption(page, page.getByLabel("Sex *", { exact: true }), "Male");
  await expect(protocolPreview(page)).toContainText("Puppy protocol:");
  await protocolPreview(page)
    .getByRole("checkbox", { name: "Schedule this protocol's care" })
    .uncheck();
  await expect(protocolPreview(page)).toContainText(
    "Nothing from this protocol will be scheduled.",
  );
  await page.getByRole("button", { name: "Create Intake" }).click();
  const created = toast(page, "Animal intake created successfully.");
  await expect(created).toBeVisible();
  await expect(created).not.toContainText("protocol");
  await waitForPathname(page, "/dashboard/animals");

  const skippedPath = await page
    .locator("tbody")
    .getByRole("link", { name: skipped, exact: true })
    .getAttribute("href");
  await page.goto(`${skippedPath}/medical`);
  await expect(page.getByRole("region", { name: "Due" })).toContainText("Nothing scheduled.");
});

// Every other spec and support file, read as text. The re-intake journey
// archives and re-intakes its animal, so it only takes one no other spec
// names.
const E2E_DIR = path.resolve(__dirname, "..");
const OTHER_SOURCES = (fs.readdirSync(E2E_DIR, { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".ts") && path.basename(file) !== path.basename(__filename),
  )
  .map((file) => fs.readFileSync(path.join(E2E_DIR, file), "utf8"))
  .join("\n");
// A whole-word match, with any letter or digit in any script as a word
// character, so an accented name is matched too.
const isNamedElsewhere = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
    "u",
  ).test(OTHER_SOURCES);

/**
 * A dog or cat in care on its first stay, with nothing an outcome would also
 * close (an application, a foster placement) and no care scheduled, that no
 * other spec names, at least 140 days old on `intakeDay`. The seeded
 * protocols for younger animals repeat doses until an age, so a re-intake
 * saved just after the shelter's midnight, with its care starting a day
 * later than the preview showed, can schedule one dose fewer; the adult
 * protocols schedule the same number either day. It is reached by id, so a
 * name it shares with another animal doesn't matter.
 * event-date-ordering.spec.ts claims its own first-stay animals by name from
 * the start of the alphabet, so this takes them from the end; once
 * re-intaked, an animal isn't on its first stay for either.
 */
const takeFirstStayDogOrCat = (intakeDay: DayKey) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>(
      `SELECT a.id, a.name FROM animals a
       JOIN species s ON s.id = a.species_id
       WHERE s.name IN ('Dog', 'Cat')
         AND a.birth_date <= $1
         AND a."listingStatus" IN ('DRAFT', 'PUBLISHED')
         AND (SELECT count(*) FROM intakes i WHERE i."animalId" = a.id) = 1
         AND NOT EXISTS (SELECT 1 FROM outcomes o WHERE o."animalId" = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM adoption_applications p WHERE p.animal_id = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM foster_placements f WHERE f.animal_id = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM medical_entries e
           WHERE e.animal_id = a.id AND e.voided_at IS NULL
             AND (e.status = 'SCHEDULED' OR e.protocol_step_id IS NOT NULL))
       ORDER BY a.name DESC, a.id DESC`,
      [shiftDay(intakeDay, -140)],
    );
    const picked = rows.find((row) => !isNamedElsewhere(row.name));
    if (!picked) {
      throw new Error("No first-stay dog or cat is free of other specs.");
    }
    return picked;
  });

test("a returning animal gets its protocol's care when it is re-intaked", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const today = todayIn(SHELTER_ZONE);
  const animal = await takeFirstStayDogOrCat(today);
  const animalPath = `/dashboard/animals/${animal.id}`;

  // It leaves today, through the outcome form. "Other" needs no partner,
  // owner or application.
  await page.goto(`/dashboard/outcomes/create?animalId=${animal.id}`);
  await waitForFormHydration(page, "Process Outcome");
  await chooseOption(page, page.getByLabel("Outcome Type *", { exact: true }), "Other");
  await pickDay(page, page.getByRole("button", { name: /^Date of Outcome \*:/ }), today);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(toast(page, "Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, "/dashboard/outcomes");

  // It comes back the same day. The re-intake form shows the protocol for
  // its species and age, and saving schedules what it showed.
  await page.goto(`${animalPath}/intake/create`);
  await waitForFormHydration(page, "Process Re-Intake");
  await chooseOption(page, page.getByLabel("Intake Type *", { exact: true }), "Seize");
  await pickDay(page, page.getByRole("button", { name: /^Intake Date \*:/ }), today);
  const { title, count } = await readPreview(page);
  expect(count).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Process Re-Intake" }).click();
  await expect(
    toast(
      page,
      `Animal re-intake processed successfully. ${title}: ${count} ${count === 1 ? "entry" : "entries"} scheduled.`,
    ),
  ).toBeVisible();
  await waitForPathname(page, animalPath);

  await page.goto(`${animalPath}/medical`);
  await expect(dueRowsFrom(page, title)).toHaveCount(count);

  await page.goto(animalPath);
  const feed = activityFeed(page);
  await expect(feed.first()).toContainText("applied a medical protocol");
  await expect(feed.nth(1)).toContainText("processed an intake");
});
