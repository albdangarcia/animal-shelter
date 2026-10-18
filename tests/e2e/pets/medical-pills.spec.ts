import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";

// /pets is public — no auth setup needed.
//
// A pet page's "Neutered" and "Microchipped" pills are read from the animal's
// medical record. Which entries count (a spay given, a chip carried, never a
// voided or scheduled one) is covered by the database tests; this spec keeps
// what only the page shows: that the pills follow the record, and that an
// exemption from a spay or neuter never reads as "Neutered".
//
// The seed spays Whiskers in house and records a neuter exemption for
// Godzilla, and both carry a chip. No spec gives either an outcome, so both
// stay listed.

const openPetPage = async (page: Page, name: string) => {
  await page.goto(`/pets?query=${name}`);
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await page.waitForURL(/\/pets\/[^/?]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
};

// The pills sit under the "Personality & Needs" heading, beside the
// characteristics.
const pills = (page: Page) =>
  page
    .getByRole("heading", { name: "Personality & Needs" })
    .locator("xpath=..");

test("the pet pages show Neutered and Microchipped from the medical record", async ({
  page,
}) => {
  await openPetPage(page, "Whiskers");
  await expect(pills(page).getByText("Neutered", { exact: true })).toBeVisible();
  await expect(
    pills(page).getByText("Microchipped", { exact: true }),
  ).toBeVisible();

  // Exempt from a neuter, not neutered: only the chip shows.
  await openPetPage(page, "Godzilla");
  await expect(
    pills(page).getByText("Microchipped", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Neutered", { exact: true })).toHaveCount(0);
});


test("recorded vaccination appears on detail and spotlight without exposing clinical data", async ({ page }, testInfo) => {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const id = () => `c${randomBytes(12).toString("hex")}`;
  const animalId = id(), emptyId = id(), itemId = id();
  const marker = `PRIVATE-${randomBytes(8).toString("hex")}`;
  const entryIds: string[] = [];
  try {
    const { rows: actors } = await db.query<{ id: string }>(`SELECT id FROM persons WHERE email='staff1@example.com'`);
    const actorId = actors[0].id;
    for (const [key, name] of [[animalId, "Vaccine badge pet"], [emptyId, "Planned care pet"]]) {
      await db.query(`INSERT INTO animals (id, name, birth_date, sex, species_id, primary_color_id, "listingStatus", updated_at)
        SELECT $1, $2, '2019-01-01', 'UNKNOWN', species_id, primary_color_id, 'PUBLISHED', now() FROM animals ORDER BY id LIMIT 1`, [key, name]);
    }
    // This owned fixture heads the normal longest-waiting selection without changing the seed.
    await db.query(`INSERT INTO intakes (id, "animalId", "intakeDate", type, "staffMemberId", "updatedAt") VALUES ($1, $2, '2020-01-01', 'STRAY', $3, now())`, [id(), animalId, actorId]);
    await db.query(`INSERT INTO medical_items (id, kind, name, updated_at) VALUES ($1, 'VACCINE', $2, now())`, [itemId, marker]);
    const add = async (key: string, kind: string, status: string, voided = false) => {
      const entryId = id(); entryIds.push(entryId);
      await db.query(`INSERT INTO medical_entries (id, animal_id, kind, status, item_id, source, completed_date, due_date, chip_number, procedure, notes, voided_at, created_by_id, updated_at)
        VALUES ($1, $2, $3::"MedicalEntryKind", $4::"MedicalEntryStatus", $5, 'BEFORE_INTAKE', null, $6, $7, $8::"SurgeryProcedure", $9, $10, $11, now())`,
        [entryId, key, kind, status, kind === "VACCINE" ? itemId : null, status === "SCHEDULED" ? "2026-10-17" : null,
          kind === "MICROCHIP" ? marker : null, kind === "SURGERY" ? "NEUTER" : null, marker, voided ? new Date() : null, actorId]);
      return entryId;
    };
    const vaccine = await add(animalId, "VACCINE", "COMPLETED");
    await db.query(`INSERT INTO vaccine_details (id, entry_id, duration_months, veterinarian_name, veterinarian_license_number, updated_at) VALUES ($1, $2, 12, $3, $3, now())`, [id(), vaccine, marker]);
    const chip = await add(animalId, "MICROCHIP", "COMPLETED");
    await db.query(`INSERT INTO microchip_details (id, entry_id, registration_status, registration_notes, updated_at) VALUES ($1, $2, 'UNKNOWN', $3, now())`, [id(), chip, marker]);
    await add(animalId, "SURGERY", "COMPLETED");
    await add(emptyId, "VACCINE", "SCHEDULED");
    await add(emptyId, "VACCINE", "COMPLETED", true);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`/pets/${animalId}`);
      expect(response!.status()).toBe(200);
      await expect(pills(page).getByText("Vaccinations recorded", { exact: true })).toBeVisible();
      await expect(pills(page).getByText("Microchipped", { exact: true })).toBeVisible();
      await expect(pills(page).getByText("Neutered", { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: testInfo.outputPath(`vaccination-detail-${width}.png`), fullPage: true });
      const html = await response!.text();
      expect(html).not.toContain(marker);
      for (const key of entryIds) expect(html).not.toContain(key);
      const rsc = await page.request.get(`/pets/${animalId}`, { headers: { RSC: "1" } });
      const payload = await rsc.text();
      expect(payload).not.toContain(marker);
      expect(payload).not.toContain("veterinarianLicenseNumber");
      for (const key of entryIds) expect(payload).not.toContain(key);
      const home = await page.goto("/");
      const hero = page.locator('section[aria-labelledby="spotlight-heading"]');
      await expect(hero.getByRole("heading", { name: "Vaccine badge pet", exact: true })).toBeVisible();
      await expect(hero.getByText("Vaccinations recorded", { exact: true })).toBeVisible();
      await expect(hero.getByText("Neutered", { exact: true })).toBeVisible();
      await expect(hero.getByText("Chipped", { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const badge = await hero.getByText("Vaccinations recorded", { exact: true }).boundingBox();
      expect(badge!.x).toBeGreaterThanOrEqual(0);
      expect(badge!.x + badge!.width).toBeLessThanOrEqual(width);
      await hero.screenshot({ path: testInfo.outputPath(`vaccination-spotlight-${width}.png`) });
      expect(await home!.text()).not.toContain(marker);
      const homePayload = await (await page.request.get("/", { headers: { RSC: "1" } })).text();
      expect(homePayload).not.toContain(marker);
      for (const key of entryIds) expect(homePayload).not.toContain(key);
      await page.goto(`/pets/${emptyId}`);
      await expect(page.getByRole("heading", { level: 1, name: "Planned care pet" })).toBeVisible();
      await expect(page.getByText("Vaccinations recorded", { exact: true })).toHaveCount(0);
    }
    await db.query(`UPDATE animals SET "listingStatus"='PENDING_ADOPTION' WHERE id=$1`, [animalId]);
    await page.goto(`/pets/${animalId}`);
    await expect(pills(page).getByText("Vaccinations recorded", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(page.locator('section[aria-labelledby="spotlight-heading"]')).not.toContainText("Vaccine badge pet");
    await db.query(`UPDATE animals SET "listingStatus"='ARCHIVED', "archiveReason"='ADOPTION' WHERE id=$1`, [animalId]);
    await page.goto(`/pets/${animalId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Vaccine badge pet" })).toHaveCount(0);
    await expect(page.getByText("Vaccinations recorded", { exact: true })).toHaveCount(0);
  } finally {
    await db.query(`DELETE FROM medical_entries WHERE animal_id IN ($1, $2)`, [animalId, emptyId]);
    await db.query(`DELETE FROM intakes WHERE "animalId" IN ($1, $2)`, [animalId, emptyId]);
    await db.query(`DELETE FROM animals WHERE id IN ($1, $2)`, [animalId, emptyId]);
    await db.query(`DELETE FROM medical_items WHERE id=$1`, [itemId]);
    await db.end();
  }
});
