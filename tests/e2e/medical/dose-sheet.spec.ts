import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";

// The sheet's rules are covered by the database tests of its read and of the
// dose batch (prisma/medication-doses.test.ts) and the unit tests of its
// layout (medication-sheet.test.ts). This is what only a browser can show:
// that Medical → Dose sheet lists a day's slots by slot and by where each
// animal is, that a round of picked slots is recorded together, all or
// nothing, with a refusal kept on screen, and who sees which controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today is the shelter's today
// rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("dose-sheet-staff.state.json");
const volunteerStatePath = storageStatePathFor("dose-sheet-volunteer.state.json");

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

const DOSES_PATH = "/dashboard/medical/doses";

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
 * The older Bruno, and where he is as the sheet groups him: his unit's
 * location, the foster he is placed with, or "Not housed". Two hand-authored
 * dogs share the name and no other spec reads either medically, so this one
 * is reached by id, told apart by its birth day. The seed leaves him not
 * housed, but in a full run foster-placements.spec.ts places the first
 * eligible animal in foster, which can be him, so his place is read rather
 * than assumed.
 */
const olderBruno = () =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string; place: string }>(
      `SELECT a.id,
              coalesce(
                l.name,
                (SELECT p.name FROM foster_placements f
                 JOIN foster_profiles fp ON fp.id = f.foster_profile_id
                 JOIN persons p ON p.id = fp.person_id
                 WHERE f.animal_id = a.id AND f.end_date IS NULL
                 ORDER BY f.start_date DESC, f.id DESC
                 LIMIT 1),
                'Not housed') AS place
       FROM animals a
       LEFT JOIN units u ON u.id = a.current_unit_id
       LEFT JOIN locations l ON l.id = u.location_id
       WHERE a.name = 'Bruno' AND a.birth_date = '2019-08-02'
         AND a."listingStatus" <> 'ARCHIVED'`,
    );
    if (rows.length !== 1) {
      throw new Error(`Expected one Bruno born 2019-08-02, found ${rows.length}.`);
    }
    return rows[0];
  });

/**
 * The younger Bruno, by his birth day. The journey gives him a course on
 * the same day, so the sheet lists both Brunos and has to tell them apart. The Medications page's spec orders on him too, under its own marker.
 */
const youngerBrunoId = () =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM animals
       WHERE name = 'Bruno' AND birth_date = '2023-04-11'
         AND "listingStatus" <> 'ARCHIVED'`,
    );
    if (rows.length !== 1) {
      throw new Error(`Expected one Bruno born 2023-04-11, found ${rows.length}.`);
    }
    return rows[0].id;
  });

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. Each test reads
// today once, at its start. The order is a one-day course yesterday, so its
// slots have ended whatever the time of day, and none is expected after. A
// day the server fills in (a dose given now, the sheet's today) is accepted
// on the day after too, in case the test runs across the shelter's midnight.
// The day helpers are the ones in medical-conditions.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// The app prints a day as "Feb 1, 2026". Read at midnight UTC, so the key
// cannot slip a day.
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Either of two days as printed, for a day the server fills in itself. */
const eitherDay = (day: DayKey) =>
  `(?:${escapeRegExp(printedDay(day))}|${escapeRegExp(printedDay(shiftDay(day, 1)))})`;

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

const toast = (page: Page, message: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message });

/**
 * One of the animal's Medications cards, by its heading. While the page
 * streams in, React can hold a hidden copy, so only the shown one counts.
 */
const card = (page: Page, heading: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .filter({ visible: true });

/** A section of the sheet: "AM", "Midday", "PM" or "As needed". */
const section = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true });

/** Where animals are, inside a section: a location, a foster or "Not housed". */
const place = (scope: Locator, title: string) =>
  scope.getByRole("region", { name: title, exact: true });

/** The rows of a place whose text holds `text` (the order's instructions). */
const rowsWith = (scope: Locator, text: string) =>
  scope.getByRole("listitem").filter({ hasText: text });

// Each Bruno as the sheet names him while both are on it: by his details.
const OLDER_BRUNO = String.raw`Bruno \(Dog · male, black, \d+ years?\)`;
const YOUNGER_BRUNO = String.raw`Bruno \(Dog · male, golden, \d+ years?\)`;

/**
 * Holds back the server actions `page` sends to `pathname` until `release`
 * is called, so the test can act on the page while a save is out.
 */
const holdActions = async (page: Page, pathname: string) => {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) await gate;
    await route.fallback();
  };
  const matches = (url: URL) => url.pathname === pathname;
  await page.route(matches, handler);
  return {
    // The gate opens first, so nothing stays held. Once the page is gone
    // its routes went with it, and unregistering would only throw.
    release: async () => {
      open();
      await page.unroute(matches, handler).catch((error: unknown) => {
        if (!page.isClosed()) throw error;
      });
    },
  };
};

/**
 * Voids every order an earlier attempt left on the animal (any not voided
 * whose instructions hold `marker`), reloading after each void since the
 * page streams in again. A voided order has a menu too (Order again), so its
 * row is left out by its name.
 */
const voidLeftoverOrders = async (page: Page, url: string, marker: string) => {
  const leftovers = () =>
    page
      .locator('li[aria-label*=" order, "]:not([aria-label$=", voided"])')
      .filter({ hasText: marker })
      .filter({ visible: true })
      .getByRole("button", { name: /^Actions for the / });
  const loaded = () => expect(card(page, "Past orders")).toBeVisible();
  await page.goto(url);
  await loaded();
  while ((await leftovers().count()) > 0) {
    await pickFromMenu(page, leftovers().first(), /^Void/);
    const voidDialog = page.getByRole("alertdialog");
    await voidDialog
      .getByLabel("Reason for voiding")
      .fill("Left by an earlier attempt of this test.");
    await voidDialog.getByRole("button", { name: "Void", exact: true }).click();
    await expect(voidDialog).toBeHidden();
    await page.goto(url);
    await loaded();
  }
};

/**
 * Orders `medication` from the animal's Medications page as a one-day course
 * yesterday: the frequency first (it moves the start to its default), then
 * the start day, then one day.
 */
const orderForYesterday = async (
  page: Page,
  {
    medication,
    dose,
    frequency,
    yesterday,
    instructions,
  }: {
    medication: string;
    dose: string;
    frequency: string;
    yesterday: DayKey;
    instructions: string;
  },
) => {
  const form = page.getByRole("dialog", { name: "Order a medication" });
  await openDialog(page.getByRole("button", { name: "Order medication" }), form);
  await chooseOption(page, form.getByRole("combobox", { name: /^Medication/ }), medication);
  await form.getByRole("spinbutton", { name: /^Dose/ }).fill(dose);
  await chooseOption(page, form.getByRole("combobox", { name: /^How often/ }), frequency);
  await pickDay(page, form.getByRole("button", { name: /^Start date \*:/ }), yesterday);
  await form.getByRole("spinbutton", { name: /^For how many days/ }).fill("1");
  await form.getByRole("textbox", { name: /^Instructions/ }).fill(instructions);
  await form.getByRole("button", { name: "Order Medication" }).click();
  await expect(form).toBeHidden();
};

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("today's sheet lists Fido's course under the Medical wing, and a day too far back shows today", async ({
    page,
  }) => {
    const today = todayIn(SHELTER_ZONE);

    // The sidebar's Medical entry has the dose sheet, between Due and Batch
    // entry.
    await page.goto("/dashboard");
    const link = page.getByRole("link", { name: "Dose sheet", exact: true });
    await expect(async () => {
      if (!(await link.isVisible())) {
        await page.getByRole("button", { name: "Medical", exact: true }).click();
      }
      await expect(link).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const medicalLinks = link.locator("xpath=ancestor::ul[1]").getByRole("link");
    await expect(medicalLinks).toHaveText(["Due", "Dose sheet", "Batch entry"]);
    await link.click();
    await page.waitForURL(`**${DOSES_PATH}`);
    await expect(page.getByRole("heading", { level: 1, name: "Dose Sheet" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText(
      new RegExp(`Today, ${eitherDay(today)}`),
    );

    // The seed's doxycycline course for Fido, in the Medical wing's MED-1,
    // runs today. Only read here.
    const fido = place(section(page, "AM"), "Medical wing")
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: "Fido", exact: true }) })
      .filter({ hasText: "Doxycycline" });
    await expect(fido).toHaveCount(1);
    await expect(fido).toHaveAttribute(
      "aria-label",
      new RegExp(`^Fido: Doxycycline, AM dose on ${eitherDay(today)}$`),
    );
    await expect(fido).toContainText("MED-1");
    await expect(fido).toContainText("Doxycycline 100 mg oral");

    // Eight days back is past what the sheet keeps: it shows today, and says
    // why.
    await page.goto(`${DOSES_PATH}?day=${shiftDay(today, -8)}`);
    await expect(
      page.getByText("The dose sheet goes back 7 days and never ahead, so it shows today."),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText(
      new RegExp(`Today, ${eitherDay(today)}`),
    );
  });

  test("yesterday's missed slots are listed by slot and place, and picked ones are recorded together, all or nothing", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const today = todayIn(SHELTER_ZONE);
    const yesterday = shiftDay(today, -1);
    const y = printedDay(yesterday);
    // A retry or a repeat runs against the database an earlier attempt wrote
    // to, so each attempt marks the instructions of what it orders.
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Dose sheet journey";
    const instructions = `${marker}: crush into food, attempt ${attempt}.`;
    const youngerInstructions = `${marker}: as needed, attempt ${attempt}.`;
    const bruno = await olderBruno();
    const medications = `/dashboard/animals/${bruno.id}/medical/medications`;
    const youngerMedications = `/dashboard/animals/${await youngerBrunoId()}/medical/medications`;

    await voidLeftoverOrders(page, medications, marker);
    await voidLeftoverOrders(page, youngerMedications, marker);

    // A one-day course yesterday, three times a day: it ended yesterday.
    await page.goto(medications);
    await orderForYesterday(page, {
      medication: "Doxycycline",
      dose: "50",
      frequency: "Three times a day",
      yesterday,
      instructions,
    });
    await expect(
      card(page, "Past orders")
        .locator('li[aria-label^="Doxycycline order, "]')
        .filter({ hasText: instructions })
        .filter({ visible: true }),
    ).toHaveAttribute("aria-label", `Doxycycline order, ended ${y.toLowerCase()}`);

    // The younger Bruno gets a one-day course twice a day on the same day, so
    // the sheet lists both Brunos. The journey gives both his slots.
    await page.goto(youngerMedications);
    await orderForYesterday(page, {
      medication: "Metronidazole",
      dose: "250",
      frequency: "Twice a day",
      yesterday,
      instructions: youngerInstructions,
    });

    // Yesterday's sheet: the order's three slots, each in its section under
    // where he is, each missed.
    const sheetOf = `${DOSES_PATH}?day=${yesterday}`;
    await page.goto(sheetOf);
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText(y);
    const row = (slot: "AM" | "Midday" | "PM") =>
      rowsWith(place(section(page, slot), bruno.place), instructions);
    const youngerRow = (slot: "AM" | "PM") =>
      section(page, slot).getByRole("listitem").filter({ hasText: youngerInstructions });
    // The two Brunos are told apart by their details.
    for (const slot of ["AM", "PM"] as const) {
      await expect(youngerRow(slot)).toHaveAttribute(
        "aria-label",
        new RegExp(`^${YOUNGER_BRUNO}: Metronidazole, ${slot} dose on ${escapeRegExp(y)}$`),
      );
    }
    for (const slot of ["AM", "Midday", "PM"] as const) {
      await expect(row(slot)).toHaveCount(1);
      await expect(row(slot)).toHaveAttribute(
        "aria-label",
        new RegExp(`^${OLDER_BRUNO}: Doxycycline, ${slot} dose on ${escapeRegExp(y)}$`),
      );
      await expect(row(slot)).toContainText("Missed");
      await expect(row(slot)).toContainText("Doxycycline 50 mg oral");
    }
    const pick = (slot: "AM" | "Midday" | "PM") =>
      row(slot).getByRole("checkbox", {
        name: new RegExp(`^Select Doxycycline, ${slot} dose on ${escapeRegExp(y)} for ${OLDER_BRUNO}$`),
      });
    const youngerGive = (slot: "AM" | "PM") =>
      youngerRow(slot).getByRole("button", {
        name: new RegExp(`^Give Metronidazole for ${YOUNGER_BRUNO}, ${slot} dose on ${escapeRegExp(y)}$`),
      });

    /** Runs `act` with the page's saves held back, then lets them go. */
    const whileSaveHeld = async (act: () => Promise<void>) => {
      const held = await holdActions(page, DOSES_PATH);
      let acted = false;
      try {
        await act();
        acted = true;
      } finally {
        // Released even when a check fails, so no request is left held. A
        // failing check's error is the one reported, not one from the release.
        await held.release().catch((error: unknown) => {
          if (acted) throw error;
        });
      }
    };

    // A Give whose save is slow leaves focus where the person moved it in the
    // meantime: the younger Bruno's PM is given while its save is held back,
    // and the older one's AM is picked before it lands.
    await whileSaveHeld(async () => {
      await youngerGive("PM").click();
      await pick("AM").check();
      await expect(pick("AM")).toBeFocused();
    });
    await expect(youngerRow("PM")).toContainText(/Given /);
    await expect(pick("AM")).toBeFocused();

    // Focus moved to the row's own checkbox goes with it once the slot is
    // recorded, so it lands on the row: the younger Bruno's AM is given while
    // its save is held back, with focus on that row's checkbox.
    await whileSaveHeld(async () => {
      await youngerGive("AM").click();
      const own = youngerRow("AM").getByRole("checkbox", {
        name: new RegExp(`^Select Metronidazole, AM dose on ${escapeRegExp(y)} for ${YOUNGER_BRUNO}$`),
      });
      await own.focus();
      await expect(own).toBeFocused();
    });
    await expect(youngerRow("AM")).toContainText(/Given /);
    await expect(youngerRow("AM")).toBeFocused();

    // All three picked. Before they are recorded, the Midday slot is given
    // from another tab: recording the three is refused, nothing is saved, and
    // the dialog keeps the refusal while the sheet refreshes under it.
    for (const slot of ["AM", "Midday", "PM"] as const) await pick(slot).check();
    const recordSelected = page.getByRole("button", { name: /^Record selected as given/ });
    await expect(recordSelected).toHaveText("Record selected as given (3)");

    const other = await page.context().newPage();
    await other.goto(sheetOf);
    const otherMidday = rowsWith(place(section(other, "Midday"), bruno.place), instructions);
    await otherMidday
      .getByRole("button", {
        name: new RegExp(`^Give Doxycycline for ${OLDER_BRUNO}, Midday dose on ${escapeRegExp(y)}$`),
      })
      .click();
    await expect(otherMidday).toContainText(/Given /);
    await other.close();

    const dialog = page.getByRole("dialog", { name: "Record 3 doses as given" });
    await openDialog(recordSelected, dialog);
    for (const slot of ["AM", "Midday", "PM"]) {
      await expect(dialog).toContainText(`Doxycycline, ${slot} dose on ${y}`);
    }
    await dialog.getByRole("button", { name: "Record 3 as given" }).click();
    const refusal = dialog.getByRole("alert");
    await expect(refusal).toContainText("Nothing was saved. Unpick this dose, then try again:");
    await expect(refusal).toContainText(
      `Doxycycline Midday dose on ${y}: The Midday dose on ${y} is already recorded.`,
    );
    await expect(dialog).toBeVisible();

    // Behind the dialog the sheet was read again: the Midday slot reads as
    // given, and since it is no longer offered its pick is dropped. The other
    // two stay picked, still missed, and Cancel hands focus back to the
    // button.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(recordSelected).toHaveText("Record selected as given (2)");
    await expect(recordSelected).toBeFocused();
    await expect(row("Midday")).toContainText(/Given /);
    await expect(pick("Midday")).toHaveCount(0);
    for (const slot of ["AM", "PM"] as const) {
      await expect(row(slot)).toContainText("Missed");
      await expect(pick(slot)).toBeChecked();
    }

    // The two recorded together: both read as given today, a day late, and
    // focus goes to the sheet's heading.
    const two = page.getByRole("dialog", { name: "Record 2 doses as given" });
    await openDialog(recordSelected, two);
    await two.getByRole("button", { name: "Record 2 as given" }).click();
    await expect(toast(page, "Recorded 2 doses as given.")).toBeVisible();
    await expect(two).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Dose Sheet" })).toBeFocused();
    for (const slot of ["AM", "Midday", "PM"] as const) {
      await expect(row(slot)).toContainText(
        new RegExp(`Given ${eitherDay(today)}, \\d{1,2}:\\d\\d [AP]M · Olivia Chen`),
      );
      await expect(pick(slot)).toHaveCount(0);
    }
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads the sheet, with nothing to pick, give or record", async ({ page }) => {
    await page.goto(DOSES_PATH);
    await expect(page.getByRole("heading", { level: 1, name: "Dose Sheet" })).toBeVisible();
    await expect(
      place(section(page, "AM"), "Medical wing")
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Fido", exact: true }) }),
    ).not.toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Give / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Other ways to record / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Record selected as given/ })).toHaveCount(0);
  });
});
