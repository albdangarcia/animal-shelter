import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// A task's due date is optional, so editing a task can take it away: with the
// X beside the picker, or by clicking the selected day again. Either way the
// trigger goes back to its placeholder rather than naming the day the task
// had, and saving leaves the task with no due date.

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor("task-due-date-clear.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the task due date E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar opens on the shelter's month.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const query = async <T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql, params);
    return rows;
  } finally {
    await client.end();
  }
};

type DatedTask = {
  id: string;
  animalId: string;
  title: string;
  dueDate: string;
};

// An open task with a due date that is its animal's only task, so the table
// shows one row. A case that already cleared its task no longer matches, so a
// retry takes the next one.
const datedTask = async () => {
  const [task] = await query<DatedTask>(
    `SELECT t.id, t.animal_id AS "animalId", t.title, t.due_date AS "dueDate"
     FROM tasks t
     JOIN animals a ON a.id = t.animal_id
     WHERE t.due_date IS NOT NULL
       AND t.status IN ('TODO', 'IN_PROGRESS')
       AND a."listingStatus" <> 'ARCHIVED'
       AND (SELECT count(*) FROM tasks o
            WHERE o.animal_id = t.animal_id AND o.status <> 'DELETED') = 1
     ORDER BY t.id`,
  );
  if (!task) throw new Error("No open task with a due date to clear.");
  return task;
};

const storedDueDate = async (taskId: string) => {
  const [row] = await query<{ dueDate: string | null }>(
    `SELECT due_date AS "dueDate" FROM tasks WHERE id = $1`,
    [taskId],
  );
  return row.dueDate;
};

// A click that lands before hydration settles opens nothing, and clicking an
// open menu's trigger again would shut it, so click only while it is closed.
const openEditDialog = async (page: Page, task: DatedTask) => {
  await page.goto(`/dashboard/animals/${task.animalId}/tasks`);
  const dialog = page.getByRole("dialog", { name: "Edit Task" });
  const edit = page.getByRole("menuitem", { name: "Edit" });
  await expect(async () => {
    if (!(await edit.isVisible())) {
      await page
        .getByRole("row")
        .filter({ hasText: task.title })
        .getByRole("button", { name: "Open menu" })
        .click();
    }
    await expect(edit).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await edit.click();
  await expect(dialog).toBeVisible();
  await waitForFormHydration(page, "Update Task");
  return dialog;
};

// Clicking submit before hydration makes the browser submit the form itself (a
// GET that appends the fields to the URL) and nothing reaches the action. React
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

// The popover's own content, rather than any dialog: the task form sits in a
// dialog itself.
const calendarOf = (page: Page) =>
  page.locator('[data-slot="popover-content"]');

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

const ways: {
  name: string;
  clear: (page: Page, dialog: Locator, task: DatedTask) => Promise<void>;
}[] = [
  {
    name: "with the X beside the picker",
    clear: async (_page, dialog) => {
      await dialog.getByRole("button", { name: "Clear date" }).click();
    },
  },
  {
    name: "by clicking the selected day again",
    clear: async (page, dialog, task) => {
      const trigger = dialog.getByRole("button", { name: /^Due Date:/ });
      const calendar = await openCalendar(page, trigger);
      // The calendar opens on today's month, so page towards the due date.
      const towards =
        task.dueDate < todayIn(SHELTER_ZONE)
          ? "Go to the Previous Month"
          : "Go to the Next Month";
      const selected = calendar.locator(
        `td[data-day="${task.dueDate}"][data-selected="true"] button`,
      );
      for (let step = 0; (await selected.count()) === 0; step++) {
        if (step > 36) throw new Error("The calendar never reached the day.");
        await calendar.getByRole("button", { name: towards }).click();
      }
      await selected.click();
      await page.keyboard.press("Escape");
      await expect(calendar).toBeHidden();
    },
  },
];

for (const way of ways) {
  test(`clearing a task's due date ${way.name} leaves it undated`, async ({
    page,
  }) => {
    const task = await datedTask();
    const dialog = await openEditDialog(page, task);

    const trigger = dialog.getByRole("button", { name: /^Due Date:/ });
    await expect(trigger).not.toHaveAttribute(
      "aria-label",
      "Due Date: Pick a date",
    );

    await way.clear(page, dialog, task);

    await expect(trigger).toHaveAttribute(
      "aria-label",
      "Due Date: Pick a date",
    );
    await expect(trigger).toHaveText("Pick a date");
    await expect(
      dialog.getByRole("button", { name: "Clear date" }),
    ).toHaveCount(0);

    await dialog.getByRole("button", { name: "Update Task" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => storedDueDate(task.id)).toBeNull();
  });
}
