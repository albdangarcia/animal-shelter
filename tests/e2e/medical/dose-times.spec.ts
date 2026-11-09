import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";

// The dose-time rules are covered by the database test
// (prisma/shelter-dose-times.test.ts) and the unit tests of the resolver and
// the form schema. This is what only a browser can show: that Settings →
// Medical → Dose times puts a refusal under its field, asks before losing
// changes, holds still while a save is out, and gives focus back.
//
// Nothing here changes the stored times: other specs read the dose sheet,
// whose slots end at these times, while this one runs. The one save sends the
// stored times back unchanged.

test.describe.configure({ mode: "serial" });

const adminPassword = process.env.ADMIN_PASSWORD;
const adminState = storageStatePathFor("dose-times-admin.state.json");
const volunteerState = storageStatePathFor("dose-times-volunteer.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD must be available to run the dose times E2E spec.");
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerState,
  });
});

const DOSE_TIMES_PATH = "/dashboard/settings/medical/dose-times";
const SLOTS = ["AM", "Midday", "PM"] as const;

const toast = (page: Page, message: string) =>
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

/** "20:00" as the card prints it: "8:00 PM". */
const printedTime = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

/**
 * Holds back the server actions `page` sends to `pathname` until `release`
 * is called, so the test can look at the form while its save is out.
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
    // (closed, or its browser with it) its routes went with it, and
    // unregistering would only throw.
    release: async () => {
      open();
      await page.unroute(matches, handler).catch((error: unknown) => {
        if (!page.isClosed()) throw error;
      });
    },
  };
};

/** Waits two frames, so what a key would have opened has rendered. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

test.describe("as an admin", () => {
  test.use({ storageState: adminState });

  test("dose times are refused under their field, guarded against loss, and saved", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(DOSE_TIMES_PATH);
    const nav = page.getByRole("navigation", { name: "Medical settings" });
    await expect(nav.getByRole("link", { name: "Dose times" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const edit = page.getByRole("button", { name: "Edit dose times" });
    const dialog = page.getByRole("dialog", { name: "Edit Dose Times" });
    const field = (slot: (typeof SLOTS)[number]) => dialog.getByLabel(`${slot} doses end at`);
    const prompt = page.getByRole("alertdialog", { name: "Discard unsaved dose times?" });
    const save = dialog.getByRole("button", { name: "Save Dose Times" });

    // The form opens on the stored times, which the card prints.
    await edit.click();
    await expect(dialog).toBeVisible();
    const stored: Record<(typeof SLOTS)[number], string> = {
      AM: await field("AM").inputValue(),
      Midday: await field("Midday").inputValue(),
      PM: await field("PM").inputValue(),
    };
    for (const slot of SLOTS) {
      expect(stored[slot]).toMatch(/^\d\d:\d\d$/);
    }

    // Unchanged, it closes with no prompt, and focus goes back to Edit.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(prompt).toHaveCount(0);
    await expect(edit).toBeFocused();
    const card = page.locator('[data-slot="card"]').filter({ hasText: "Dose Times" });
    for (const slot of SLOTS) {
      await expect(
        card.locator("div").filter({ hasText: `${slot} doses end at` }).last(),
      ).toContainText(printedTime(stored[slot]));
    }

    // Refusals land under their own fields.
    await edit.click();
    await field("Midday").fill(stored.AM);
    await save.click();
    await expect(messageUnder(dialog, page.getByLabel("Midday doses end at"))).toHaveText(
      "Midday doses must end after AM doses.",
    );
    await field("AM").fill("");
    await save.click();
    await expect(messageUnder(dialog, page.getByLabel("AM doses end at"))).toHaveText(
      "Enter a time of day, such as 10:00.",
    );

    // Changed, Escape asks first; Cancel keeps the edit, Discard drops it.
    await page.keyboard.press("Escape");
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect(prompt).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(field("Midday")).toHaveValue(stored.AM);
    await page.keyboard.press("Escape");
    await prompt.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toBeHidden();
    await expect(edit).toBeFocused();

    // A save of the stored times: while it is out, the fields are disabled and
    // Escape is ignored. Then it saves, closes, and the card still reads them.
    await edit.click();
    await expect(field("AM")).toHaveValue(stored.AM);
    const held = await holdActions(page, DOSE_TIMES_PATH);
    let checked = false;
    try {
      await save.click();
      await expect(dialog.getByRole("button", { name: /Saving/ })).toBeVisible();
      for (const slot of SLOTS) await expect(field(slot)).toBeDisabled();
      await page.keyboard.press("Escape");
      await nextFrames(page);
      // Still open, not animating out: a closing dialog stays visible a moment.
      await expect(dialog).toHaveAttribute("data-state", "open");
      await expect(prompt).toHaveCount(0);
      checked = true;
    } finally {
      // Released even when a check fails, so no request is left held. A
      // failing check's error is the one reported, not one from the release.
      await held.release().catch((error: unknown) => {
        if (checked) throw error;
      });
    }
    await expect(toast(page, "Dose times saved.")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(edit).toBeFocused();
    for (const slot of SLOTS) {
      await expect(
        card.locator("div").filter({ hasText: `${slot} doses end at` }).last(),
      ).toContainText(printedTime(stored[slot]));
    }
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerState });

  test("the dose times page is denied", async ({ page }) => {
    await page.goto(DOSE_TIMES_PATH);
    await expect(page.getByText(/access denied/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit dose times" })).toHaveCount(0);
  });
});
