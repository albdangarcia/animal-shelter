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
