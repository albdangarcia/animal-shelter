import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const states = Object.fromEntries(["staff", "volunteer", "foster", "adopter"].map((key) => [key, storageStatePathFor(`history-output-${key}.json`)]));
test.beforeAll(async ({ browser }) => {
  for (const [key, email] of [["staff", "staff1@example.com"], ["volunteer", "volunteer1@example.com"], ["foster", "surrenderer1@example.com"], ["adopter", "finder1@example.com"]]) {
    await bootstrapStorageState(browser, { email, password: SEEDED_USER_PASSWORD, storageStatePath: states[key] });
  }
});
const id = () => `c${randomBytes(12).toString("hex")}`;
const withDb = async <T>(run: (db: pg.Client) => Promise<T>) => {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try { return await run(db); } finally { await db.end(); }
};
async function fixture() {
  return withDb(async (db) => {
    await db.query("BEGIN");
    const animalId = id(), emptyId = id(), itemId = id(), medicationId = id();
    const marker = `PRIVATE-${randomBytes(5).toString("hex")}`;
    const name = `History animal ${"long name ".repeat(10)}`;
    const product = `Recorded vaccine ${"long product ".repeat(11)}`;
    const registry = `Registry${"X".repeat(90)}`;
    const { rows: staff } = await db.query<{ id: string }>(`SELECT id FROM persons WHERE email = 'staff1@example.com'`);
    const actorId = staff[0].id;
    for (const [key, label] of [[animalId, name], [emptyId, "Empty history animal"]]) await db.query(`INSERT INTO animals (id, name, birth_date, sex, species_id, primary_color_id, "listingStatus", updated_at)
      SELECT $1, $2, '2020-01-01', 'UNKNOWN', species_id, primary_color_id, 'DRAFT', now() FROM animals ORDER BY id LIMIT 1`, [key, label]);
    await db.query(`INSERT INTO intakes (id, "animalId", "intakeDate", type, "staffMemberId", "updatedAt") VALUES ($1, $2, '2026-01-01', 'STRAY', $3, now())`, [id(), animalId, actorId]);
    await db.query(`INSERT INTO medical_items (id, kind, name, is_rabies, updated_at) VALUES ($1, 'VACCINE', $2, true, now()), ($3, 'MEDICATION', 'Recorded medication', false, now())`, [itemId, product, medicationId]);
    const entries: string[] = [];
    for (let i = 0; i < 26; i++) {
      const entryId = id(); entries.push(entryId);
      await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, item_id, source, completed_date, notes, vet_name, created_by_id, updated_at)
        VALUES ($1, $2, 'VACCINE', 'COMPLETED', $3, 'BEFORE_INTAKE', $4, $5, $5, $6, now())`, [entryId, animalId, itemId, i === 25 ? null : `2026-02-${String(i + 1).padStart(2, "0")}`, marker, actorId]);
      await db.query(`INSERT INTO vaccine_details (id, entry_id, manufacturer, lot_number, duration_months, valid_until_date, veterinarian_name, veterinarian_license_number, updated_at)
        VALUES ($1, $2, 'Recorded manufacturer', $3, 12, $4, $5, $5, now())`, [id(), entryId, `Lot-${i}`, i === 25 ? null : "2027-02-01", marker]);
    }
    const chipId = id();
    await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, source, completed_date, chip_number, created_by_id, updated_at) VALUES ($1, $2, 'MICROCHIP', 'COMPLETED', 'BEFORE_INTAKE', null, $3, $4, now())`, [chipId, animalId, `OUTPUT${randomBytes(6).toString("hex").toUpperCase()}`, actorId]);
    await db.query(`INSERT INTO microchip_details (id, entry_id, brand, registration_status, registry_name, registration_date, registration_notes, updated_at) VALUES ($1, $2, 'Recorded brand', 'REGISTERED', $3, '2026-02-28', $4, now())`, [id(), chipId, registry, marker]);
    await db.query(`INSERT INTO medical_conditions (id, animal_id, type, name, status, onset_date, notes, diagnosed_by, created_by_id, updated_at) VALUES ($1, $2, 'ALLERGY', 'Recorded allergy', 'CHRONIC', '2026-02-28', $3, $3, $4, now())`, [id(), animalId, marker, actorId]);
    await db.query(`INSERT INTO care_episodes (id, animal_id, type, start_date, reason, notes, opened_by_id, updated_at) VALUES ($1, $2, 'UNDER_VET_CARE', '2026-02-28', $3, $3, $4, now())`, [id(), animalId, marker, actorId]);
    const instructions = `Give with food. ${"Recorded instruction with wrapping. ".repeat(35)} Final instruction.`;
    await db.query(`INSERT INTO medication_orders (id, animal_id, item_id, dose_amount, dose_unit, route, frequency, start_date, instructions, prescribed_by, created_by_id, updated_at) VALUES ($1, $2, $3, 1, 'TABLET', 'ORAL', 'PRN', '2026-02-28', $4, $5, $6, now())`, [id(), animalId, medicationId, instructions, marker, actorId]);
    await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, item_id, due_date, created_by_id, updated_at) VALUES ($1, $2, 'VACCINE', 'SCHEDULED', $3, '2026-03-01', $4, now())`, [id(), animalId, itemId, actorId]);
    await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, completed_date, notes, created_by_id, updated_at) VALUES ($1, $2, 'DEATH', 'COMPLETED', '2026-03-02', $3, $4, now())`, [id(), animalId, marker, actorId]);
    await db.query(`INSERT INTO medical_documents (id, animal_id, entry_id, name, type, document_date, notes, pathname, content_type, size_bytes, uploaded_by_id, updated_at) VALUES ($1, $2, $3, 'Relevant vet record', 'VET_RECORD', '2026-02-28', $4, $5, 'application/pdf', 100, $6, now())`, [id(), animalId, entries[0], marker, `${marker}/file.pdf`, actorId]);
    const { rows: profiles } = await db.query<{ id: string; personId: string }>(`SELECT f.id, f.person_id AS "personId" FROM foster_profiles f JOIN persons p ON p.id = f.person_id WHERE p.email = 'surrenderer1@example.com'`);
    await db.query(`INSERT INTO foster_placements (id, type, start_date, animal_id, foster_profile_id, placed_by_id, "updatedAt") VALUES ($1, 'GENERAL', '2026-01-01', $2, $3, $4, now())`, [id(), emptyId, profiles[0].id, actorId]);
    // Adopted history remains accessible to medical readers; open rows are preserved.
    await db.query(`INSERT INTO outcomes (id, "animalId", "outcomeDate", type, "staffMemberId", "previousListingStatus", "updatedAt") VALUES ($1, $2, '2026-03-02', 'ADOPTION', $3, 'DRAFT', now())`, [id(), animalId, actorId]);
    await db.query(`UPDATE animals SET "listingStatus" = 'ARCHIVED', "archiveReason" = 'ADOPTION' WHERE id = $1`, [animalId]);
    await db.query("COMMIT");
    return { animalId, emptyId, itemId, medicationId, entries, marker, registry, name, product };
  });
}
const counts = (animalId: string) => withDb(async (db) => (await db.query(`SELECT
  (SELECT count(*) FROM medical_entries WHERE animal_id=$1) AS entries,
  (SELECT count(*) FROM medical_documents WHERE animal_id=$1) AS documents,
  (SELECT count(*) FROM medical_entry_events WHERE entry_id IN (SELECT id FROM medical_entries WHERE animal_id=$1)) AS events,
  (SELECT count(*) FROM animal_activity_logs WHERE "animalId"=$1) AS activities`, [animalId])).rows[0]);
async function cleanup(f: Awaited<ReturnType<typeof fixture>>) {
  await withDb(async (db) => {
    for (const animalId of [f.animalId, f.emptyId]) {
      await db.query(`DELETE FROM medical_documents WHERE animal_id=$1`, [animalId]);
      await db.query(`DELETE FROM medical_entries WHERE animal_id=$1`, [animalId]);
      await db.query(`DELETE FROM foster_placements WHERE animal_id=$1`, [animalId]);
      await db.query(`DELETE FROM outcomes WHERE "animalId"=$1`, [animalId]);
      await db.query(`DELETE FROM intakes WHERE "animalId"=$1`, [animalId]);
      await db.query(`DELETE FROM animals WHERE id=$1`, [animalId]);
    }
    await db.query(`DELETE FROM medical_items WHERE id IN ($1, $2)`, [f.itemId, f.medicationId]);
  });
}

test("medical readers print the full safe handout, with private direct access and usable paper layouts", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const context = await browser.newContext({ storageState: states.staff, timezoneId: "America/New_York", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const route = `/medical-outputs/animals/${f.animalId}/history`;
  try {
    const before = await counts(f.animalId);
    await page.goto(`/dashboard/animals/${f.animalId}/medical`);
    await page.getByRole("link", { name: "Print adopter medical history", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Medical history — ${f.name}`, exact: true })).toBeVisible();
    const response = await page.reload();
    expect(response!.headers()["cache-control"]).toMatch(/no-cache.*must-revalidate/);
    expect(response!.headers()["cache-control"]).not.toMatch(/public|s-maxage/);
    const html = await response!.text();
    expect(html).not.toContain(f.marker);
    expect(html).not.toContain("staff1@example.com");
    expect(html).not.toContain("veterinarianLicenseNumber");
    expect(html).not.toContain("/api/medical-documents");
    expect(html).not.toContain(`${f.marker}/file.pdf`);
    const rsc = await context.request.get(route, { headers: { RSC: "1" } });
    expect(rsc.headers()["cache-control"]).toMatch(/no-cache/);
    expect(rsc.status()).toBe(200);
    const payload = await rsc.text();
    expect(payload).toContain(f.product);
    expect(payload).not.toContain(f.marker);
    expect(payload).not.toContain("/api/medical-documents");
    expect((await context.request.get("/medical-outputs/animals/invalid/history")).status()).toBe(404);
    expect((await context.request.get(`/medical-outputs/animals/${id()}/history`)).status()).toBe(404);
    await expect(page.getByRole("region", { name: "Completed care", exact: true }).locator("tbody tr")).toHaveCount(27);
    await expect(page.getByText(f.registry, { exact: false })).toBeVisible();
    await expect(page.getByText(/Registration day: Feb 28, 2026/)).toBeVisible();
    await expect(page.getByText("Open — no end day recorded", { exact: false })).toBeVisible();
    await expect(page.getByText("Final instruction.", { exact: false })).toBeVisible();
    await expect(page.getByText("Relevant vet record", { exact: false })).toBeVisible();
    await expect(page.getByRole("link")).toHaveCount(1);
    await page.evaluate(() => { (window as Window & { printCalls?: number }).printCalls = 0; window.print = () => { (window as Window & { printCalls?: number }).printCalls = ((window as Window & { printCalls?: number }).printCalls ?? 0) + 1; }; });
    await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
    expect(await page.evaluate(() => (window as Window & { printCalls?: number }).printCalls)).toBe(1);
    await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as Window & { printCalls?: number }).printCalls)).toBe(2);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: testInfo.outputPath(`history-screen-${width}.png`), fullPage: true, animations: "disabled" });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Print controls" })).toBeHidden();
    expect(await page.locator("thead").first().evaluate((el) => getComputedStyle(el).display)).toBe("table-header-group");
    await page.screenshot({ path: testInfo.outputPath("history-print.png"), fullPage: true, animations: "disabled" });
    for (const format of ["Letter", "A4"] as const) await page.pdf({ path: testInfo.outputPath(`history-${format}.pdf`), format, printBackground: true });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("link", { name: "Return to medical record", exact: true }).click();
    await expect(page).toHaveURL(`/dashboard/animals/${f.animalId}/medical`);
    await page.goto(`/dashboard/animals/${f.animalId}/medical/history`);
    await page.getByRole("link", { name: "Print adopter medical history", exact: true }).click();
    await expect(page).toHaveURL(route);
    // Fresh full requests reflect corrections and voids even after a previous print.
    await withDb(async (db) => {
      await db.query(`UPDATE vaccine_details SET lot_number='Corrected lot' WHERE entry_id=$1`, [f.entries[0]]);
      await db.query(`UPDATE medical_entries SET voided_at=now() WHERE id=$1`, [f.entries[1]]);
    });
    await page.goto(route);
    await expect(page.getByText(/Lot: Corrected lot/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Completed care", exact: true }).locator("tbody tr")).toHaveCount(26);
    const reader = await browser.newContext({ storageState: states.volunteer, timezoneId: "Pacific/Kiritimati" });
    try {
      const other = await reader.newPage();
      await other.goto(route);
      await expect(other.getByText(/Registration day: Feb 28, 2026/)).toBeVisible();
      await expect(other.getByText(/Lot: Corrected lot/)).toBeVisible();
      await expect(other.getByText("Valid through Feb 1, 2027", { exact: false })).toBeVisible();
      await expect(other.getByRole("region", { name: "Completed care", exact: true }).locator("tbody tr td").first()).toHaveText("Feb 25, 2026");
      await other.goto(`/medical-outputs/animals/${f.emptyId}/history`);
      await expect(other.getByText("No completed care records available.", { exact: true })).toBeVisible();
      await expect(other.getByText("No condition or allergy records available.", { exact: true })).toBeVisible();
      for (const width of [1280, 390]) {
        await other.setViewportSize({ width, height: 900 });
        await expect.poll(() => other.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await other.screenshot({ path: testInfo.outputPath(`history-empty-${width}.png`), fullPage: true });
      }
    } finally { await reader.close(); }
    for (const state of [undefined, states.foster, states.adopter]) {
      const denied = await browser.newContext(state ? { storageState: state } : {});
      try {
        for (const animalId of [f.animalId, f.emptyId]) {
          const res = await denied.request.get(`/medical-outputs/animals/${animalId}/history`);
          expect(res.status()).toBe(404);
          const deniedHtml = await res.text();
          expect(deniedHtml).not.toContain(f.product);
          expect(deniedHtml).not.toContain(f.name);
          expect(deniedHtml).not.toContain(f.marker);
          const rsc = await denied.request.get(`/medical-outputs/animals/${animalId}/history`, { headers: { RSC: "1" } });
          const deniedPayload = await rsc.text();
          expect(deniedPayload).not.toContain(f.product);
          expect(deniedPayload).not.toContain(f.name);
          expect(deniedPayload).not.toContain(f.marker);
        }
      } finally { await denied.close(); }
    }
    expect(await counts(f.animalId)).toEqual(before);
  } finally { await context.close(); await cleanup(f); }
});

test("medical readers print a selected rabies certificate only after its missing facts are corrected", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const selected = f.entries[0];
  const route = `/medical-outputs/animals/${f.animalId}/rabies/${selected}`;
  const record = `/dashboard/animals/${f.animalId}/medical/vaccines-tests`;
  const vet = `Dr Recorded ${"Long veterinarian name ".repeat(8)}`;
  const license = `LICENSE-${"X".repeat(90)}`;
  await withDb(async (db) => {
    await db.query(`UPDATE medical_entries SET completed_date='2025-02-28' WHERE id=$1`, [selected]);
    await db.query(`UPDATE vaccine_details SET veterinarian_name=null, veterinarian_license_number=null, valid_until_date='2026-02-28' WHERE entry_id=$1`, [selected]);
  });
  const context = await browser.newContext({ storageState: states.staff, timezoneId: "America/New_York", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Rabies certificate unavailable" })).toBeVisible();
    await expect(page.getByText("Record the veterinarian's name and license number before printing a certificate.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toHaveCount(0);
    await page.getByRole("link", { name: "Correct this vaccination record" }).click();
    await expect(page).toHaveURL(`${record}#medical-entry-${selected}`);
    const row = page.locator(`[id="medical-entry-${selected}"]`);
    await expect(row).toContainText("Certificate unavailable:");
    await row.getByRole("button", { name: /^Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit vaccine", exact: true });
    await edit.getByLabel("Veterinarian name", { exact: true }).fill(vet);
    await edit.getByLabel("Veterinarian license number").fill(license);
    await edit.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(edit).toBeHidden();
    await row.getByRole("link", { name: "Print rabies certificate", exact: true }).click();
    await expect(page).toHaveURL(route);
    await expect(page.getByRole("heading", { name: `Rabies vaccination certificate — ${f.name}`, exact: true })).toBeVisible();
    const before = await counts(f.animalId);
    const response = await page.reload();
    expect(response!.headers()["cache-control"]).toMatch(/no-cache.*must-revalidate/);
    expect(response!.headers()["cache-control"]).not.toMatch(/public|s-maxage/);
    expect(await response!.text()).not.toContain(f.marker);
    const payload = await context.request.get(route, { headers: { RSC: "1" } });
    expect(payload.status()).toBe(200);
    expect(await payload.text()).toContain(license);
    expect(await payload.text()).not.toContain(f.marker);
    const vaccination = page.getByRole("region", { name: "Recorded vaccination", exact: true });
    await expect(vaccination).toContainText("Lot-0");
    await expect(vaccination).not.toContainText("Lot-24");
    await expect(vaccination).toContainText("Feb 28, 2025");
    await expect(vaccination).toContainText("Feb 28, 2026");
    await expect(vaccination).toContainText("Expired as of");
    await expect(page.getByText(vet, { exact: true })).toBeVisible();
    await expect(page.getByText(license, { exact: true })).toBeVisible();
    await expect(page.getByText("Veterinarian signature:", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Blank signature line")).toBeVisible();
    await page.evaluate(() => { (window as Window & { printed?: boolean }).printed = false; window.print = () => { (window as Window & { printed?: boolean }).printed = true; }; });
    await page.getByRole("button", { name: "Print / Save as PDF" }).click();
    expect(await page.evaluate(() => (window as Window & { printed?: boolean }).printed)).toBe(true);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: testInfo.outputPath(`certificate-screen-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Print controls" })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("certificate-print.png"), fullPage: true });
    for (const format of ["Letter", "A4"] as const) await page.pdf({ path: testInfo.outputPath(`certificate-${format}.pdf`), format, printBackground: true });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("link", { name: "Return to medical record" }).click();
    await expect(page).toHaveURL(record);
    expect(await counts(f.animalId)).toEqual(before);
    const reader = await browser.newContext({ storageState: states.volunteer, timezoneId: "Pacific/Kiritimati" });
    try {
      const other = await reader.newPage();
      await other.goto(route);
      await expect(other.getByRole("region", { name: "Recorded vaccination" })).toContainText("Feb 28, 2025");
      await expect(other.getByRole("region", { name: "Recorded vaccination" })).toContainText("Feb 28, 2026");
      await other.goto(`/medical-outputs/animals/${f.animalId}/rabies/${f.entries[25]}`);
      await expect(other.getByRole("heading", { name: "Rabies certificate unavailable" })).toBeVisible();
      await expect(other.getByRole("link", { name: "Correct this vaccination record" })).toHaveCount(0);
    } finally { await reader.close(); }
    for (const state of [undefined, states.foster, states.adopter]) {
      const denied = await browser.newContext(state ? { storageState: state } : {});
      try {
        for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
          const res = await denied.request.get(route, { headers });
          if (!headers.RSC) expect(res.status()).toBe(404);
          const text = await res.text();
          if (headers.RSC) expect(text).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
          for (const fact of [f.product, f.name, vet, license, f.marker]) expect(text).not.toContain(fact);
        }
      } finally { await denied.close(); }
    }
    for (const url of [
      `/medical-outputs/animals/${f.emptyId}/rabies/${selected}`,
      `/medical-outputs/animals/${f.animalId}/rabies/${id()}`,
      `/medical-outputs/animals/${f.animalId}/rabies/invalid`,
      `/medical-outputs/animals/invalid/rabies/${selected}`,
    ]) expect((await context.request.get(url)).status()).toBe(404);
    // A subsequent audited correction reaches a fresh certificate request.
    await row.getByRole("button", { name: /^Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await edit.getByLabel("Veterinarian license number").fill("CORRECTED-LICENSE");
    await edit.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(edit).toBeHidden();
    await row.getByRole("link", { name: "Print rabies certificate", exact: true }).click();
    await expect(page.getByText("CORRECTED-LICENSE", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Return to medical record" }).click();
    await row.getByRole("button", { name: /^Actions for/ }).click();
    await page.getByRole("menuitem", { name: /Void/ }).click();
    const voidDialog = page.getByRole("alertdialog");
    await voidDialog.getByLabel("Reason for voiding").fill("Wrong animal");
    await voidDialog.getByRole("button", { name: "Void Entry", exact: true }).click();
    await expect(voidDialog).toBeHidden();
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Rabies certificate unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Correct this vaccination record" })).toHaveCount(0);
    const refused = await context.request.get(route, { headers: { RSC: "1" } });
    expect(await refused.text()).not.toContain("CORRECTED-LICENSE");
  } finally { await context.close(); await cleanup(f); }
});

test("seeded output examples retain unknown facts and show printable care and per-chip registration", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const examples = await withDb(async (db) => (await db.query<{
    animalId: string; entryId: string; name: string; complete: boolean;
  }>(`SELECT a.id AS "animalId", e.id AS "entryId", a.name,
      COALESCE(v.lot_number = 'RB-DEMO-104', false) AS complete
    FROM vaccine_details v JOIN medical_entries e ON e.id = v.entry_id
    JOIN animals a ON a.id = e.animal_id
    WHERE v.lot_number = 'RB-DEMO-104' OR v.rabies_tag_number = 'R-LEGACY-105'
    ORDER BY complete DESC`)).rows);
  expect(examples).toHaveLength(2);
  const before = await Promise.all(examples.map((example) => counts(example.animalId)));
  const context = await browser.newContext({ storageState: states.volunteer });
  const page = await context.newPage();
  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const example of examples) {
        const key = example.complete ? "complete" : "legacy";
        await page.goto(`/medical-outputs/animals/${example.animalId}/history`);
        await expect(page.getByRole("heading", { name: `Medical history — ${example.name}`, exact: true })).toBeVisible();
        await expect(page.locator("main")).toContainText(example.name);
        await expect(page.locator("main")).toContainText("Date unknown");
        await expect(page.locator("main")).toContainText("Unknown");
        if (example.complete) {
          for (const text of ["PetLink", "HomeAgain", "Registered", "Pending", "Seasonal pollen allergy", "Give with food morning and evening.", "Recheck"]) {
            await expect(page.locator("main")).toContainText(text);
          }
          await expect(page.locator("main")).not.toContainText("Registry confirmation retained by staff.");
        } else {
          await expect(page.locator("main")).toContainText("Not registered");
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`seeded-${key}-history-${width}.png`), fullPage: true });
        await page.goto(`/medical-outputs/animals/${example.animalId}/rabies/${example.entryId}`);
        if (example.complete) {
          await expect(page.getByRole("heading", { name: `Rabies vaccination certificate — ${example.name}`, exact: true })).toBeVisible();
          await expect(page.locator("main")).toContainText("Dr. Amara Okafor");
          await expect(page.locator("main")).toContainText("DEMO-1041");
        } else {
          await expect(page.getByRole("heading", { name: "Rabies certificate unavailable" })).toBeVisible();
          await expect(page.locator("main")).toContainText("Record the vaccination date");
          await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toHaveCount(0);
        }
        await page.screenshot({ path: testInfo.outputPath(`seeded-${key}-certificate-${width}.png`), fullPage: true });
        await page.goto(`/pets/${example.animalId}`);
        await expect(page.getByText("Vaccinations recorded", { exact: true })).toBeVisible();
        await expect(page.getByText("Microchipped", { exact: true })).toBeVisible();
        await expect(page.locator("body")).not.toContainText("977200009020");
      }
    }
    expect(await Promise.all(examples.map((example) => counts(example.animalId)))).toEqual(before);
  } finally { await context.close(); }
});
