import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const state = storageStatePathFor("animal-navigation-volunteer.json");
let animalId: string;

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: state,
  });
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM animals WHERE name = $1 LIMIT 1', ["Frisco"]);
    animalId = rows[0].id;
  } finally { await db.end(); }
});

test.use({ storageState: state, viewport: { width: 390, height: 844 } });

test("animal navigation names the current section and medical tabs reveal the current page on mobile", async ({ page }, testInfo) => {
  const base = `/dashboard/animals/${animalId}`;
  await page.goto(`${base}/medical/documents`);
  const trigger = page.getByRole("button", { name: "Animal sections: Medical", exact: true });
  await expect(trigger).toHaveText("Medical");
  const sections = page.getByRole("navigation", { name: "Medical sections", exact: true });
  const selectedFits = () => sections.evaluate((nav) => {
    const active = nav.querySelector('[aria-current="page"]')?.getBoundingClientRect();
    const bounds = nav.getBoundingClientRect();
    return !!active && active.left >= bounds.left && active.right <= bounds.right;
  });
  await expect(sections.getByRole("link", { name: "Documents", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(selectedFits).toBe(true);
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Medical", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("menuitem", { name: "Tasks", exact: true }).click();
  await expect(page).toHaveURL(`${base}/tasks`);
  await expect(page.getByRole("button", { name: "Animal sections: Tasks", exact: true })).toHaveText("Tasks");
  await page.goBack();
  await expect(trigger).toBeVisible();
  await expect.poll(selectedFits).toBe(true);
  await sections.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(`${base}/medical/history`);
  await expect(sections.getByRole("link", { name: "History", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(selectedFits).toBe(true);
  await trigger.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("mobile-navigation.png") });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(page.getByRole("link", { name: "Medical", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(selectedFits).toBe(true);
});
