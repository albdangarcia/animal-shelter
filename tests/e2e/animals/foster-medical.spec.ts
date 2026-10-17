import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, getPlaywrightEnv } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const janeState = storageStatePathFor("foster-care-jane.state.json");
const samState = storageStatePathFor("foster-care-sam.state.json");
const staffState = storageStatePathFor("foster-care-staff.state.json");
const zone = process.env.SHELTER_TIMEZONE || "America/New_York";
test.use({ timezoneId: zone, viewport: { width: 390, height: 844 } });

test.beforeAll(async ({ browser }) => {
  for (const [email, storageStatePath] of [
    ["surrenderer1@example.com", janeState], ["volunteer1@example.com", samState], ["staff1@example.com", staffState],
  ]) await bootstrapStorageState(browser, { email, password: SEEDED_USER_PASSWORD, storageStatePath });
});

const withDb = async <T>(run: (db: pg.Client) => Promise<T>) => {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try { return await run(db); } finally { await db.end(); }
};
const cuid = () => `c${randomBytes(12).toString("hex")}`;
const printed = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

// One page-wiring journey. The database tests exercise the individual rules;
// these fixtures belong only to this journey and are removed afterwards.
test("fosters give doses and a scheduled treatment on their own medical page", async ({ browser }) => {
  test.setTimeout(120_000);
  const fixture = await withDb(async (db) => {
    const { rows: placements } = await db.query<{ id: string; animal_id: string; name: string; person_id: string; email: string }>(`
      SELECT fp.id, fp.animal_id, a.name, p.id AS person_id, p.email
      FROM foster_placements fp JOIN foster_profiles f ON f.id = fp.foster_profile_id
      JOIN persons p ON p.id = f.person_id JOIN animals a ON a.id = fp.animal_id
      WHERE fp.end_date IS NULL AND p.email IN ('surrenderer1@example.com', 'volunteer1@example.com')`);
    const jane = placements.find((p) => p.email === "surrenderer1@example.com")!;
    const sam = placements.find((p) => p.email === "volunteer1@example.com" && p.name === "Juniper")!;
    expect(jane).toBeTruthy();
    expect(sam).toBeTruthy();
    const { rows: staff } = await db.query<{ id: string }>(`SELECT id FROM persons WHERE email = 'staff1@example.com'`);
    const { rows: dates } = await db.query<{ today: string; yesterday: string }>(`SELECT
      to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS today,
      to_char((now() AT TIME ZONE $1) - interval '1 day', 'YYYY-MM-DD') AS yesterday`, [zone]);
    const medicationId = cuid(), treatmentId = cuid(), orderId = cuid(), entryId = cuid();
    const marker = randomBytes(4).toString("hex");
    const medicineName = `Foster medicine ${marker}`;
    const treatmentName = `Dewormer${marker}${"x".repeat(84)}`;
    await db.query(`INSERT INTO medical_items (id, kind, name, updated_at) VALUES ($1, 'MEDICATION', $2, now())`, [medicationId, medicineName]);
    await db.query(`INSERT INTO medical_items (id, kind, name, repeat_interval_days, default_dose_amount, default_dose_unit, default_route, updated_at)
      VALUES ($1, 'TREATMENT', $2, 14, 2, 'ML', 'ORAL', now())`, [treatmentId, treatmentName]);
    await db.query(`INSERT INTO medication_orders (id, animal_id, item_id, dose_amount, dose_unit, route, frequency, start_date, first_slot, created_by_id, updated_at)
      VALUES ($1, $2, $3, 1, 'TABLET', 'ORAL', 'BID', $4, 'AM', $5, now())`, [orderId, jane.animal_id, medicationId, dates[0].yesterday, staff[0].id]);
    await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, item_id, due_date, notes, created_by_id, updated_at)
      VALUES ($1, $2, 'TREATMENT', 'SCHEDULED', $3, $4, 'Give with food', $5, now())`, [entryId, jane.animal_id, treatmentId, dates[0].today, staff[0].id]);
    const documentId = cuid();
    const pathname = `medical-documents/${jane.animal_id}/${documentId}`;
    const documentPath = path.join(getPlaywrightEnv().MEDICAL_DOCUMENT_DIR!, pathname);
    const bytes = await fs.readFile("prisma/seed-files/sample-vet-record.pdf");
    await fs.mkdir(path.dirname(documentPath), { recursive: true });
    await fs.writeFile(documentPath, bytes);
    await db.query(`INSERT INTO medical_documents (id, animal_id, name, type, pathname, content_type, size_bytes, uploaded_by_id, updated_at)
      VALUES ($1, $2, 'Foster care instructions', 'VET_RECORD', $3, 'application/pdf', $4, $5, now())`, [documentId, jane.animal_id, pathname, bytes.byteLength, staff[0].id]);
    return { jane, sam, medicationId, treatmentId, orderId, entryId, medicineName, treatmentName, documentId, documentPath, ...dates[0] };
  });
  const context = await browser.newContext({ storageState: janeState, viewport: { width: 390, height: 844 }, timezoneId: zone });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/dashboard/my-foster-animals");
    await page.getByRole("link", { name: "Medical care", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Medical care for ${fixture.jane.name}` })).toBeVisible();
    const documentLink = page.getByRole("region", { name: "Documents", exact: true }).getByRole("link", { name: "Foster care instructions", exact: true });
    await expect(documentLink).toBeVisible();
    expect((await context.request.get((await documentLink.getAttribute("href"))!)).status()).toBe(200);
    const medications = page.getByRole("region", { name: "Medications", exact: true });
    const slot = (day: string, time: "AM" | "PM") => medications.getByRole("listitem", { name: `${fixture.medicineName}, ${time} dose on ${printed(day)}`, exact: true });
    const morning = slot(fixture.today, "AM");
    await morning.getByRole("button", { name: /^Give / }).click();
    await expect(morning).toContainText(/Given .*You/);
    await expect(morning).toBeFocused();
    await slot(fixture.today, "PM").getByRole("button", { name: /^Other ways/ }).click();
    await page.getByRole("menuitem", { name: "Refused…", exact: true }).click();
    let dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Record .* as refused$/ }) });
    await dialog.getByLabel("Reason").fill("Spat it out");
    await dialog.getByRole("button", { name: "Record Dose", exact: true }).click();
    await expect(slot(fixture.today, "PM")).toContainText("Refused: Spat it out");
    await slot(fixture.yesterday, "AM").getByRole("button", { name: /^Other ways/ }).click();
    await page.getByRole("menuitem", { name: "Not given…", exact: true }).click();
    dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Record .* as not given$/ }) });
    await dialog.getByLabel(/Why not/).fill("Waiting for the delivery");
    await dialog.getByRole("button", { name: "Record Dose", exact: true }).click();
    await expect(slot(fixture.yesterday, "AM")).toContainText("Not given: Waiting for the delivery");
    await slot(fixture.yesterday, "PM").getByRole("button", { name: /^Other ways/ }).click();
    await page.getByRole("menuitem", { name: "Record with details…", exact: true }).click();
    dialog = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Record Dose", exact: true }) });
    await expect(dialog.getByRole("button", { name: "Date given or tried *:" })).toBeVisible();
    await dialog.getByLabel("Notes", { exact: true }).fill("With dinner");
    await dialog.getByRole("button", { name: "Record Dose", exact: true }).click();
    await expect(slot(fixture.yesterday, "PM")).toContainText("With dinner");
    await expect(medications.getByRole("button", { name: /^Void/ })).toHaveCount(0);
    await page.getByRole("button", { name: `Record ${fixture.treatmentName} as given`, exact: true }).click();
    dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: `Record ${fixture.treatmentName} as given`, exact: true }) });
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(dialog).toBeInViewport({ ratio: 1 });
    const submit = dialog.getByRole("button", { name: "Record treatment", exact: true });
    await expect(submit).toBeInViewport({ ratio: 1 });
    const dialogBox = (await dialog.boundingBox())!;
    const submitBox = (await submit.boundingBox())!;
    expect(dialogBox.width).toBeLessThanOrEqual(390);
    expect(submitBox.x).toBeGreaterThanOrEqual(dialogBox.x);
    expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
    await expect(dialog.getByRole("button", { name: "Date given *:" })).toBeVisible();
    await expect(dialog.getByLabel("Notes", { exact: true })).toHaveValue("Give with food");
    await dialog.getByLabel("Notes", { exact: true }).fill("Given with food");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.getByRole("button", { name: "Record treatment", exact: true }).click();
    await expect(page.getByRole("region", { name: "Care due", exact: true })).toContainText(fixture.treatmentName);
    await expect(page.locator("#foster-care-due")).toBeFocused();
    await expect.poll(() => withDb(async (db) => (await db.query<{ status: string }>(`SELECT status FROM medical_entries WHERE id = $1`, [fixture.entryId])).rows[0].status)).toBe("COMPLETED");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.goto(`/dashboard/my-foster-animals/${fixture.sam.animal_id}`);
    await expect(page.getByRole("heading", { name: "Foster animal Not Found" })).toBeVisible();
    await page.goto(`/dashboard/my-foster-animals/${fixture.jane.animal_id}`);
    await page.getByRole("button", { name: `Record ${fixture.treatmentName} as given`, exact: true }).click();
    await withDb((db) => db.query(`UPDATE foster_placements SET end_date = $2 WHERE id = $1`, [fixture.jane.id, fixture.today]));
    await page.getByRole("dialog").getByRole("button", { name: "Record treatment", exact: true }).click();
    await expect(page.getByText("This animal isn't in your care any more, so nothing can be recorded for it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Foster animal Not Found" })).toBeVisible();
    expect((await context.request.get(`/api/medical-documents/${fixture.documentId}`)).status()).toBe(404);
    await withDb((db) => db.query(`UPDATE foster_placements SET end_date = NULL WHERE id = $1`, [fixture.jane.id]));
    const samContext = await browser.newContext({ storageState: samState, viewport: { width: 390, height: 844 } });
    try {
      const samPage = await samContext.newPage();
      await samPage.goto(`/dashboard/my-foster-animals/${fixture.sam.animal_id}`);
      await expect(samPage.getByRole("heading", { name: "Medical care for Juniper", exact: true })).toBeVisible();
      await expect(samPage.getByRole("button", { name: /^Record Pyrantel pamoate as given$/ })).toBeVisible();
      await samPage.goto(`/dashboard/animals/${fixture.sam.animal_id}/medical`);
      await expect(samPage.getByRole("button", { name: /^Record .* as given/ })).toHaveCount(0);
    } finally { await samContext.close(); }
    const staffContext = await browser.newContext({ storageState: staffState });
    try {
      const staffPage = await staffContext.newPage();
      await staffPage.goto(`/dashboard/animals/${fixture.jane.animal_id}/medical/history`);
      await expect(staffPage.getByText("Given in foster by Jane Doe", { exact: false }).first()).toBeVisible();
      await staffPage.goto(`/dashboard/animals/${fixture.jane.animal_id}/medical/medications`);
      await expect(staffPage.getByText(/Jane Doe \(foster\)/).first()).toBeVisible();
    } finally { await staffContext.close(); }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await withDb(async (db) => {
      await db.query(`UPDATE foster_placements SET end_date = NULL WHERE id = $1`, [fixture.jane.id]);
      await db.query(`DELETE FROM medical_documents WHERE id = $1`, [fixture.documentId]);
      await db.query(`DELETE FROM medication_doses WHERE order_id = $1`, [fixture.orderId]);
      await db.query(`DELETE FROM medication_orders WHERE id = $1`, [fixture.orderId]);
      await db.query(`DELETE FROM medical_entries WHERE animal_id = $1 AND item_id = $2`, [fixture.jane.animal_id, fixture.treatmentId]);
      await db.query(`DELETE FROM medical_items WHERE id IN ($1, $2)`, [fixture.medicationId, fixture.treatmentId]);
      await db.query(`DELETE FROM animal_activity_logs WHERE "animalId" = $1 AND ("changeSummary" LIKE $2 OR "changeSummary" LIKE $3)`, [fixture.jane.animal_id, `%${fixture.medicineName}%`, `%${fixture.treatmentName}%`]);
    });
    await fs.rm(fixture.documentPath, { force: true });
  }
});
