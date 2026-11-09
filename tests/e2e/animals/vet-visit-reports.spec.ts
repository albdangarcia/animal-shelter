import path from "node:path";
import { promises as fs } from "node:fs";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, getPlaywrightEnv } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const janeState = storageStatePathFor("visit-jane.state.json");
const rosaState = storageStatePathFor("visit-rosa.state.json");
const staffState = storageStatePathFor("visit-staff.state.json");
const volunteerState = storageStatePathFor("visit-volunteer.state.json");
const zone = process.env.SHELTER_TIMEZONE || "America/New_York";
test.use({ timezoneId: zone, viewport: { width: 390, height: 844 } });
test.beforeAll(async ({ browser }) => {
  for (const [email, storageStatePath] of [["surrenderer1@example.com", janeState], ["foster1@example.com", rosaState], ["staff1@example.com", staffState], ["volunteer1@example.com", volunteerState]]) await bootstrapStorageState(browser, { email, password: SEEDED_USER_PASSWORD, storageStatePath });
});
const withDb = async <T>(run: (db: pg.Client) => Promise<T>) => { const db = new pg.Client({ connectionString: E2E_DATABASE_URL }); await db.connect(); try { return await run(db); } finally { await db.end(); } };

// The report's page wiring, paperwork and staff handoff; rule permutations live in database tests.
test("a foster reports a visit with paperwork, staff record care and close it, and the foster reads the result", async ({ browser }, info) => {
  test.setTimeout(180_000);
  const marker = `Visit-${info.retry}-${info.repeatEachIndex}`;
  const fixture = await withDb(async (db) => {
    const { rows } = await db.query<{ animal_id: string; name: string; email: string; start_date: string }>(`SELECT fp.animal_id, a.name, p.email, fp.start_date FROM foster_placements fp JOIN foster_profiles f ON f.id=fp.foster_profile_id JOIN persons p ON p.id=f.person_id JOIN animals a ON a.id=fp.animal_id WHERE fp.end_date IS NULL AND p.email IN ('foster1@example.com','surrenderer1@example.com')`);
    const rosa = rows.find((row) => row.email === "foster1@example.com")!;
    const jane = rows.find((row) => row.email === "surrenderer1@example.com")!;
    expect(rosa).toBeTruthy(); expect(jane).toBeTruthy();
    const { rows: seed } = await db.query<{ role: string; status: string; max_animals: number; can_give_oral_meds: boolean; order_count: number; dose_count: number; open_today: number; due_count: number; reports: number; waiting: number; reviewed: number; docs: number; provenance: number }>(`SELECT u.role, f.status, f.max_animals, f.can_give_oral_meds,
      (SELECT count(*)::int FROM medication_orders WHERE animal_id=$1) order_count,
      (SELECT count(*)::int FROM medication_doses WHERE animal_id=$1 AND reported_by_foster) dose_count,
      (SELECT count(*)::int FROM medication_doses WHERE animal_id=$1 AND slot_date=to_char(now() AT TIME ZONE $2,'YYYY-MM-DD')) open_today,
      (SELECT count(*)::int FROM medical_entries e JOIN medical_items i ON i.id=e.item_id WHERE e.animal_id=$1 AND e.status='SCHEDULED' AND i.name='Pyrantel pamoate') due_count,
      (SELECT count(*)::int FROM vet_visit_reports WHERE animal_id=$1) reports,
      (SELECT count(*)::int FROM vet_visit_reports WHERE animal_id=$1 AND reviewed_at IS NULL) waiting,
      (SELECT count(*)::int FROM vet_visit_reports WHERE animal_id=$1 AND reviewed_at IS NOT NULL) reviewed,
      (SELECT count(*)::int FROM medical_documents WHERE animal_id=$1 AND vet_report_id IS NOT NULL) docs,
      (SELECT count(*)::int FROM medical_entries WHERE animal_id=$1 AND vet_report_id IS NOT NULL AND reported_by_foster) provenance
      FROM persons p JOIN users u ON u."personId"=p.id JOIN foster_profiles f ON f.person_id=p.id WHERE p.email='foster1@example.com'`, [rosa.animal_id, zone]);
    expect(seed[0]).toMatchObject({ role: "USER", status: "ACTIVE", max_animals: 2, can_give_oral_meds: true, order_count: 1, dose_count: 6, open_today: 0, due_count: 1, reports: 2, waiting: 1, reviewed: 1, docs: 2, provenance: 1 });
    const { rows: baseline } = await db.query<{ id: string }>(`SELECT id FROM animal_activity_logs WHERE "animalId"=$1`, [jane.animal_id]);
    const { rows: entryBaseline } = await db.query<{ id: string }>(`SELECT id FROM medical_entries WHERE animal_id=$1`, [jane.animal_id]);
    return { rosa, jane, activityIds: baseline.map((row) => row.id), entryIds: entryBaseline.map((row) => row.id) };
  });
  const contexts = await Promise.all([janeState, staffState, volunteerState, rosaState].map((storageState) => browser.newContext({ storageState, viewport: { width: 390, height: 844 }, timezoneId: zone })));
  const [jane, staff, volunteer, rosa] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  for (const page of [jane, staff, volunteer, rosa]) page.on("pageerror", (error) => errors.push(error.message));
  try {
    await rosa.goto("/dashboard/my-foster-animals");
    await rosa.getByRole("link", { name: "Medical care", exact: true }).click();
    await expect(rosa.getByRole("heading", { name: `Medical care for ${fixture.rosa.name}` })).toBeVisible();
    await expect(rosa.getByRole("region", { name: "Your vet visit reports" })).toContainText("Waiting for the shelter");
    await expect(rosa.getByRole("region", { name: "Your vet visit reports" })).toContainText("Reviewed on");
    await jane.goto(`/dashboard/my-foster-animals/${fixture.jane.animal_id}`);
    const reportVisit = async (summary: string) => {
      await jane.getByRole("button", { name: "Report outside vet visit", exact: true }).click();
      const dialog = jane.getByRole("dialog", { name: "Report outside vet visit", exact: true });
      await expect(dialog.getByRole("button", { name: /^Visit date \*:/, exact: true })).toBeVisible();
      await dialog.getByRole("combobox", { name: "Clinic" }).click();
      await jane.getByRole("option", { name: "Downtown Veterinary Clinic", exact: true }).click();
      await dialog.getByLabel("What happened", { exact: true }).fill(summary);
      await dialog.getByRole("button", { name: "Send report", exact: true }).click();
      await expect(dialog).toBeHidden();
    };
    await reportVisit(`${marker} · Vaccine paperwork`);
    const reportRow = jane.getByRole("region", { name: "Your vet visit reports" }).getByRole("listitem").filter({ hasText: `${marker} · Vaccine paperwork` });
    await expect(reportRow).toContainText("Waiting for the shelter");
    await reportRow.getByRole("button", { name: "Add paperwork", exact: true }).click();
    const upload = jane.getByRole("dialog", { name: "Add paperwork", exact: true });
    await upload.getByLabel("File *", { exact: true }).setInputFiles({ name: `${marker}.pdf`, mimeType: "application/pdf", buffer: await fs.readFile("prisma/seed-files/sample-vet-record.pdf") });
    await expect(upload.getByRole("combobox", { name: "Type *", exact: true })).toContainText("Vet record");
    await expect(upload.getByRole("combobox", { name: "Belongs to" })).toHaveCount(0);
    await upload.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(upload).toBeHidden();
    const file = jane.getByRole("region", { name: "Documents", exact: true }).getByRole("link", { name: marker, exact: true });
    await expect(file).toBeVisible();
    const response = await contexts[0].request.get((await file.getAttribute("href"))!);
    expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toBe("application/pdf");
    await staff.goto(`/dashboard/animals/${fixture.jane.animal_id}/medical`);
    const alerts = staff.getByRole("region", { name: "Foster reports waiting for review", exact: true });
    await expect(alerts.getByRole("link")).toHaveCount(1);
    await expect(staff.getByRole("region", { name: "Due", exact: true })).toBeVisible();
    await staff.goto("/dashboard/medical/due");
    await expect(staff.getByRole("region", { name: "Foster reports", exact: true })).toContainText(marker);
    const docsUrl = `/dashboard/animals/${fixture.jane.animal_id}/medical/documents`;
    await volunteer.goto(docsUrl);
    const readOnly = volunteer.getByRole("region", { name: "Foster reports", exact: true });
    await expect(readOnly).toContainText(marker);
    await expect(readOnly.getByRole("button")).toHaveCount(0);
    await staff.goto(docsUrl);
    const staffRow = staff.locator('li[id^="vet-report-"]').filter({ hasText: `${marker} · Vaccine paperwork` });
    await staffRow.getByRole("button", { name: "Record care…", exact: true }).click();
    await staff.getByRole("dialog").getByRole("button", { name: "Vaccine", exact: true }).click();
    const record = staff.getByRole("dialog", { name: "Record vaccine from report", exact: true });
    await expect(record.getByRole("radio", { name: "Outside vet", exact: true })).toBeChecked();
    await expect(record.getByRole("combobox", { name: "Vet clinic" })).toContainText("Downtown Veterinary Clinic");
    await record.getByRole("combobox", { name: "Vaccine *", exact: true }).click();
    await staff.getByRole("option", { name: "DHPP", exact: true }).click();
    await record.getByRole("checkbox", { name: "Schedule the next one", exact: true }).uncheck();
    await record.getByRole("button", { name: "Record Vaccine", exact: true }).click();
    await expect(record).toBeHidden();
    await expect(staffRow).toContainText("Entries recorded from this report");
    await expect(staffRow).toContainText("DHPP");
    await staffRow.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await expect(staffRow).toContainText("Reviewed by Olivia Chen");
    await expect(staffRow).toBeFocused();
    await jane.reload(); await expect(reportRow).toContainText("Reviewed on");
    await expect(reportRow.getByRole("button", { name: "Add paperwork" })).toHaveCount(0);
    await reportVisit(`${marker} · Duplicate visit`);
    await staff.reload();
    const duplicate = staff.locator('li[id^="vet-report-"]').filter({ hasText: `${marker} · Duplicate visit` });
    await duplicate.getByRole("button", { name: "Dismiss", exact: true }).click();
    const dismissal = staff.getByRole("alertdialog", { name: "Dismiss vet visit report?" });
    await dismissal.getByRole("textbox", { name: "Reason for dismissal" }).fill("Already recorded at intake");
    await dismissal.getByRole("button", { name: "Dismiss report", exact: true }).click();
    await expect(dismissal).toBeHidden();
    await expect(duplicate).toBeFocused();
    await jane.reload();
    await expect(jane.getByRole("region", { name: "Your vet visit reports" })).toContainText("Dismissed: Already recorded at intake");
    await expect(staff.locator("[data-sonner-toast]")).toHaveCount(0);
    await jane.screenshot({ path: info.outputPath("foster-reports-mobile.png"), fullPage: true });
    await staff.screenshot({ path: info.outputPath("staff-reports-mobile.png"), fullPage: true });
    for (const page of [jane, staff]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await staff.goto(`/dashboard/animals/${fixture.jane.animal_id}/medical`);
    await expect(staff.getByRole("region", { name: "Foster reports waiting for review" })).toHaveCount(0);
    await expect(staff.getByText(/From a foster's report of the visit on/).first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await withDb(async (db) => {
      const { rows } = await db.query<{ pathname: string }>(`DELETE FROM medical_documents WHERE vet_report_id IN (SELECT id FROM vet_visit_reports WHERE animal_id=$1 AND summary LIKE $2) RETURNING pathname`, [fixture.jane.animal_id, `${marker}%`]);
      await db.query(`DELETE FROM medical_entries WHERE animal_id=$1 AND NOT(id=ANY($2::text[]))`, [fixture.jane.animal_id, fixture.entryIds]);
      await db.query(`DELETE FROM vet_visit_reports WHERE animal_id=$1 AND summary LIKE $2`, [fixture.jane.animal_id, `${marker}%`]);
      await db.query(`DELETE FROM animal_activity_logs WHERE "animalId"=$1 AND NOT(id=ANY($2::text[]))`, [fixture.jane.animal_id, fixture.activityIds]);
      for (const row of rows) await fs.rm(path.join(getPlaywrightEnv().MEDICAL_DOCUMENT_DIR!, row.pathname), { force: true });
    });
  }
});
