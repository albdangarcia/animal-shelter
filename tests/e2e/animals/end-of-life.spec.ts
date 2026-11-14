import { format, parseISO } from "date-fns";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, getPlaywrightEnv } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const states = Object.fromEntries(["staff", "admin", "volunteer", "foster"].map((key) => [key, storageStatePathFor(`clinical-outcome-${key}.json`)]));
const zone = process.env.SHELTER_TIMEZONE || "America/New_York";
test.beforeAll(async ({ browser }) => {
  for (const [key, email] of [["staff", "staff1@example.com"], ["admin", "admin@example.com"], ["volunteer", "volunteer1@example.com"], ["foster", "surrenderer1@example.com"]]) {
    await bootstrapStorageState(browser, { email, password: key === "admin" ? process.env.ADMIN_PASSWORD! : SEEDED_USER_PASSWORD, storageStatePath: states[key] });
  }
});
const withDb = async <T>(run: (db: pg.Client) => Promise<T>) => {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try { return await run(db); } finally { await db.end(); }
};
const id = () => `c${randomBytes(12).toString("hex")}`;
const printed = (day: string) => format(parseISO(day), "PPP");
async function fixture(foster = false, legacy = false) {
  return withDb(async (db) => {
    await db.query("BEGIN");
    const animalId = id(), personId = id(), marker = randomBytes(4).toString("hex");
    const name = `Clinical animal ${marker}`, personName = `Clinical person ${marker}`;
    const { rows: dates } = await db.query<{ today: string; yesterday: string; intake: string }>(`SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS today,
      to_char((now() AT TIME ZONE $1) - interval '1 day', 'YYYY-MM-DD') AS yesterday,
      to_char((now() AT TIME ZONE $1) - interval '5 days', 'YYYY-MM-DD') AS intake`, [zone]);
    const { rows: staff } = await db.query<{ id: string }>(`SELECT id FROM persons WHERE email = 'staff1@example.com'`);
    await db.query(`INSERT INTO persons (id, name, "updatedAt") VALUES ($1, $2, now())`, [personId, personName]);
    await db.query(`INSERT INTO animals (id, name, birth_date, sex, species_id, primary_color_id, "listingStatus", updated_at)
      SELECT $1, $2, '2020-01-01', 'UNKNOWN', species_id, primary_color_id, 'DRAFT', now() FROM animals ORDER BY id LIMIT 1`, [animalId, name]);
    await db.query(`INSERT INTO intakes (id, "animalId", "intakeDate", type, "staffMemberId", "updatedAt") VALUES ($1, $2, $3, 'STRAY', $4, now())`, [id(), animalId, dates[0].intake, staff[0].id]);
    let placementId: string | null = null;
    if (foster) {
      const { rows } = await db.query<{ id: string }>(`SELECT f.id FROM foster_profiles f JOIN persons p ON p.id = f.person_id WHERE p.email = 'surrenderer1@example.com'`);
      placementId = id();
      await db.query(`INSERT INTO foster_placements (id, type, start_date, animal_id, foster_profile_id, placed_by_id, "updatedAt") VALUES ($1, 'GENERAL', $2, $3, $4, $5, now())`, [placementId, dates[0].intake, animalId, rows[0].id, staff[0].id]);
    }
    let outcomeId: string | null = null;
    if (legacy) {
      outcomeId = id();
      await db.query(`INSERT INTO outcomes (id, "animalId", "outcomeDate", type, "staffMemberId", "previousListingStatus", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'DECEASED', $4, 'DRAFT', '2026-01-01T12:00:00Z', now())`, [outcomeId, animalId, dates[0].yesterday, staff[0].id]);
      await db.query(`UPDATE animals SET "listingStatus" = 'ARCHIVED', "archiveReason" = 'DECEASED' WHERE id = $1`, [animalId]);
    }
    await db.query("COMMIT");
    return { animalId, personId, name, personName, staffId: staff[0].id, placementId, outcomeId, ...dates[0] };
  });
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const cleanup = (f: Fixture) => withDb(async (db) => {
  await db.query(`DELETE FROM medical_documents WHERE animal_id = $1`, [f.animalId]);
  await db.query(`DELETE FROM medical_entries WHERE animal_id = $1`, [f.animalId]);
  await db.query(`DELETE FROM foster_placements WHERE animal_id = $1`, [f.animalId]);
  await db.query(`DELETE FROM outcomes WHERE "animalId" = $1`, [f.animalId]);
  await db.query(`DELETE FROM intakes WHERE "animalId" = $1`, [f.animalId]);
  await db.query(`DELETE FROM animals WHERE id = $1`, [f.animalId]);
  await db.query(`DELETE FROM persons WHERE id = $1`, [f.personId]);
});
const stored = (f: Fixture) => withDb(async (db) => (await db.query<{ outcomeId: string; entryId: string; day: string; medicalDay: string; voidedAt: Date | null; reversedAt: Date | null }>(`SELECT o.id AS "outcomeId", e.id AS "entryId", o."outcomeDate" AS day, e.completed_date AS "medicalDay", e.voided_at AS "voidedAt", o."reversedAt" AS "reversedAt" FROM outcomes o JOIN medical_entries e ON e.outcome_id = o.id WHERE o."animalId" = $1`, [f.animalId])).rows[0]);
async function hydrated(page: Page, submit: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: submit, exact: true }) });
  await expect.poll(() => form.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps")))).toBe(true);
}
async function chooseType(page: Page, name: string) {
  const option = page.getByRole("listbox").getByRole("option", { name, exact: true });
  await expect(async () => {
    if (!await option.isVisible()) await page.getByRole("combobox", { name: "Outcome Type *", exact: true }).click();
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await option.click();
}
async function pickDay(page: Page, day: string) {
  const [year, month, date] = day.split("-").map(Number);
  await page.getByRole("button", { name: /^Date of Outcome \*:/ }).click();
  const dialog = page.getByRole("dialog");
  const cell = dialog.locator(`button[data-day="${month}/${date}/${year}"]`).first();
  while (!await cell.isVisible()) await dialog.getByRole("button", { name: "Go to the Previous Month" }).click();
  await cell.click();
}
async function pickPerson(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByPlaceholder("Type a name, email, or phone...").fill(name);
  await page.getByRole("option").filter({ hasText: name }).click();
}
async function reverse(page: Page, f: Fixture) {
  await page.goto(`/dashboard/outcomes?query=${encodeURIComponent(f.name)}`);
  const row = page.locator("tbody tr").filter({ hasText: f.name });
  const trigger = row.getByRole("button", { name: "Open menu" });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Reverse…", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Reverse…", exact: true }).click();
  await page.getByRole("textbox", { name: "Reason for reversal" }).fill("Recorded against the wrong animal");
  await page.getByRole("button", { name: "Reverse Outcome", exact: true }).click();
  await expect(row).toContainText("Reversed");
  await expect.poll(async () => (await stored(f)).voidedAt !== null).toBe(true);
}

test("staff records and corrects euthanasia; only outcome reversal voids it and retains paperwork", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const f = await fixture();
  const staff = await browser.newContext({ storageState: states.staff, viewport: { width: 390, height: 844 }, timezoneId: "Pacific/Auckland" });
  const page = await staff.newPage();
  let documentPath: string | undefined;
  let releasePending = () => {};
  try {
    await page.goto(`/dashboard/outcomes/create?animalId=${f.animalId}`);
    await hydrated(page, "Process Outcome");
    await chooseType(page, "Euthanized");
    await page.getByLabel("Reason category").selectOption("MEDICAL");
    await pickPerson(page, "Authorized by", f.personName);
    await pickPerson(page, "Performed by", f.personName);
    await page.getByLabel("Drug *", { exact: true }).fill("Recorded agent");
    await page.getByLabel("Dose including unit *", { exact: true }).fill("Recorded amount mL");
    await page.getByLabel("Route *", { exact: true }).fill("Recorded route");
    await page.getByLabel("Witness", { exact: true }).fill("Recorded witness");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Body disposition", { exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: /^Date of Outcome \*:/ })).toContainText(printed(f.today));
    await page.getByLabel("Source *", { exact: true }).selectOption("OUTSIDE_VET");
    await page.getByLabel("Performer type").selectOption("NAME");
    const outsidePerformer = page.getByLabel("Performed by outside vet *", { exact: true });
    let createPosts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"] && new URL(request.url()).pathname === "/dashboard/outcomes/create") createPosts += 1;
    });
    await page.getByRole("button", { name: "Process Outcome", exact: true }).click();
    await expect(outsidePerformer).toHaveAttribute("aria-invalid", "true");
    await expect(outsidePerformer.locator("..").getByText("Pick a performer or give the outside vet's name.", { exact: true })).toBeVisible();
    await expect(outsidePerformer).toBeFocused();
    expect(createPosts).toBe(0);
    await outsidePerformer.fill("Outside clinician");
    await page.screenshot({ path: testInfo.outputPath("euthanasia-form-mobile.png"), fullPage: true });
    // A selected reference disappearing must refuse on screen and roll back the archive.
    await withDb((db) => db.query(`DELETE FROM persons WHERE id = $1`, [f.personId]));
    await page.getByRole("button", { name: "Process Outcome", exact: true }).click();
    await expect(page.getByText("Pick a person from the directory.").first()).toBeVisible();
    expect(await withDb(async (db) => (await db.query(`SELECT "listingStatus" FROM animals WHERE id = $1`, [f.animalId])).rows[0].listingStatus)).toBe("DRAFT");
    expect(await stored(f)).toBeUndefined();
    await withDb((db) => db.query(`INSERT INTO persons (id, name, "updatedAt") VALUES ($1, $2, now())`, [f.personId, f.personName]));
    // The refusal toast overlays the mobile submit button; moving off it lets
    // its normal dismissal timer run before the next submission.
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    releasePending = release;
    await page.route("**/dashboard/outcomes/create?**", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    const requestPromise = page.waitForRequest((request) => request.method() === "POST" && !!request.headers()["next-action"]);
    const clicked = page.getByRole("button", { name: "Process Outcome", exact: true }).click({ noWaitAfter: true });
    const request = await requestPromise;
    try { await expect(page.getByRole("button", { name: "Processing...", exact: true })).toBeDisabled(); } finally { release(); }
    await clicked;
    await page.waitForURL("**/dashboard/outcomes");
    const saved = await stored(f);
    expect(saved.day).toBe(f.today); expect(saved.medicalDay).toBe(f.today);
    expect(await withDb(async (db) => (await db.query(`SELECT count(*)::int AS count FROM outcomes WHERE "animalId" = $1`, [f.animalId])).rows[0].count)).toBe(1);
    const volunteer = await browser.newContext({ storageState: states.volunteer });
    try {
      const refusal = await volunteer.request.post(request.url(), { headers: { "next-action": request.headers()["next-action"], "content-type": request.headers()["content-type"], origin: new URL(request.url()).origin }, data: request.postDataBuffer()! });
      expect(await refusal.text()).toContain("Access Denied");
      const read = await volunteer.newPage();
      await read.goto(`/dashboard/animals/${f.animalId}/medical/history`);
      await expect(read.getByRole("listitem", { name: /^Euthanasia,/ })).toContainText("Recorded agent");
      await expect(read.getByRole("link", { name: "Correct through outcome" })).toHaveCount(0);
      await read.goto(`/dashboard/outcomes/${saved.outcomeId}/edit`);
      await expect(read.getByRole("button", { name: "Update Outcome", exact: true })).toHaveCount(0);
      await expect(read.getByRole("listitem", { name: /^Euthanasia,/ })).toContainText(f.personName);
    } finally { await volunteer.close(); }
    await page.goto(`/dashboard/animals/${f.animalId}/medical/history`);
    const row = page.getByRole("listitem", { name: /^Euthanasia,/ });
    await expect(row).toContainText("Recorded witness");
    await expect(row).toContainText("Outside clinician");
    await expect(row.getByRole("button", { name: /actions|menu/i })).toHaveCount(0);
    await row.getByRole("link", { name: "Correct through outcome" }).click();
    await hydrated(page, "Update Outcome");
    await expect(page.getByLabel("Witness", { exact: true })).toHaveValue("Recorded witness");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: testInfo.outputPath("euthanasia-correction-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await pickDay(page, f.yesterday);
    await page.getByLabel("Witness", { exact: true }).fill("Corrected witness");
    await page.getByRole("button", { name: "Update Outcome", exact: true }).click();
    await page.waitForURL("**/dashboard/outcomes");
    expect((await stored(f)).medicalDay).toBe(f.yesterday);
    const documentId = id();
    const pathname = `medical-documents/${f.animalId}/${documentId}`;
    documentPath = path.join(getPlaywrightEnv().MEDICAL_DOCUMENT_DIR!, pathname);
    const bytes = await fs.readFile("prisma/seed-files/sample-vet-record.pdf");
    await fs.mkdir(path.dirname(documentPath), { recursive: true }); await fs.writeFile(documentPath, bytes);
    await withDb((db) => db.query(`INSERT INTO medical_documents (id, animal_id, entry_id, name, type, pathname, content_type, size_bytes, uploaded_by_id, updated_at) VALUES ($1, $2, $3, 'Clinical paperwork', 'VET_RECORD', $4, 'application/pdf', $5, $6, now())`, [documentId, f.animalId, saved.entryId, pathname, bytes.length, f.staffId]));
    const admin = await browser.newContext({ storageState: states.admin });
    try { await reverse(await admin.newPage(), f); } finally { await admin.close(); }
    await page.goto(`/dashboard/animals/${f.animalId}/medical/history?kind=EUTHANASIA`);
    const voided = page.getByRole("listitem", { name: /^Euthanasia,.*voided/ });
    await expect(voided).toContainText("Corrected witness");
    await voided.getByRole("button", { name: /Show .* changes/ }).click();
    await expect(voided.getByRole("list", { name: "Change history" })).toContainText("Recorded witness → Corrected witness");
    expect((await staff.request.get(`/api/medical-documents/${documentId}`)).status()).toBe(200);
    await expect(voided.getByRole("link", { name: "Clinical paperwork" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath("euthanasia-mobile.png"), fullPage: true });
    await page.goto(`/dashboard/outcomes/${saved.outcomeId}/edit`);
    await expect(page.getByRole("heading", { name: "Outcome Reversed" })).toBeVisible();
  } finally { releasePending(); await staff.close(); await cleanup(f); if (documentPath) await fs.rm(documentPath, { force: true }); }
});

test("death with unknown facts ends foster access, moves its day with the placement, and reversal restores access", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const f = await fixture(true);
  const staff = await browser.newContext({ storageState: states.staff, viewport: { width: 390, height: 844 }, timezoneId: zone });
  const foster = await browser.newContext({ storageState: states.foster });
  const page = await staff.newPage(), fosterPage = await foster.newPage();
  try {
    await fosterPage.goto(`/dashboard/my-foster-animals/${f.animalId}`);
    await expect(fosterPage.getByRole("heading", { name: `Medical care for ${f.name}` })).toBeVisible();
    await page.goto(`/dashboard/outcomes/create?animalId=${f.animalId}`);
    await hydrated(page, "Process Outcome"); await chooseType(page, "Deceased");
    await page.getByLabel("Circumstances").selectOption("FOUND_DEAD");
    await page.getByLabel("Cause knowledge").selectOption("UNKNOWN");
    await page.getByLabel("Necropsy requested").selectOption("UNKNOWN");
    await page.getByRole("button", { name: "Process Outcome", exact: true }).click();
    await page.waitForURL("**/dashboard/outcomes");
    const saved = await stored(f);
    await fosterPage.reload();
    await expect(fosterPage.getByRole("heading", { name: "Foster animal Not Found" })).toBeVisible();
    await page.goto(`/dashboard/outcomes/${saved.outcomeId}/edit`);
    await hydrated(page, "Update Outcome");
    await expect(page.getByRole("listitem", { name: /^Death,/ })).toContainText("Cause: Unknown");
    await pickDay(page, f.yesterday);
    await page.getByRole("button", { name: "Update Outcome", exact: true }).click();
    await page.waitForURL("**/dashboard/outcomes");
    expect((await stored(f)).medicalDay).toBe(f.yesterday);
    expect(await withDb(async (db) => (await db.query(`SELECT end_date FROM foster_placements WHERE id = $1`, [f.placementId])).rows[0].end_date)).toBe(f.yesterday);
    const admin = await browser.newContext({ storageState: states.admin });
    try { await reverse(await admin.newPage(), f); } finally { await admin.close(); }
    await fosterPage.reload();
    await expect(fosterPage.getByRole("heading", { name: `Medical care for ${f.name}` })).toBeVisible();
    await page.goto(`/dashboard/animals/${f.animalId}/medical/history?kind=DEATH`);
    await expect(page.getByRole("listitem", { name: /^Death,.*voided/ })).toContainText("Necropsy requested: Unknown");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.getByText(f.name, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("death-mobile.png"), fullPage: true });
  } finally { await staff.close(); await foster.close(); await cleanup(f); }
});

test("staff explicitly adds missing legacy details with current provenance", async ({ browser }) => {
  const f = await fixture(false, true);
  const context = await browser.newContext({ storageState: states.staff });
  const page = await context.newPage();
  try {
    const before = await withDb(async (db) => (await db.query(`SELECT "createdAt", "staffMemberId" FROM outcomes WHERE id = $1`, [f.outcomeId])).rows[0]);
    await page.goto(`/dashboard/outcomes/${f.outcomeId}/edit`);
    await hydrated(page, "Update Outcome");
    await expect(page.getByText("Medical details not recorded")).toBeVisible();
    await page.getByRole("button", { name: "Add medical details", exact: true }).click();
    await page.getByLabel("Circumstances").selectOption("DURING_PROCEDURE");
    await page.getByLabel("Cause knowledge").selectOption("KNOWN");
    await page.getByLabel("Cause *", { exact: true }).fill("Recorded historical cause");
    await page.getByRole("button", { name: "Update Outcome", exact: true }).click();
    await page.waitForURL("**/dashboard/outcomes");
    expect(await withDb(async (db) => (await db.query(`SELECT "createdAt", "staffMemberId" FROM outcomes WHERE id = $1`, [f.outcomeId])).rows[0])).toEqual(before);
    const saved = await stored(f);
    expect(saved.medicalDay).toBe(f.yesterday);
    await page.goto(`/dashboard/animals/${f.animalId}/medical/history`);
    await expect(page.getByRole("listitem", { name: /^Death,/ })).toContainText("Recorded historical cause");
  } finally { await context.close(); await cleanup(f); }
});

// The service's refusal is covered in prisma/re-intake-after-death.test.ts;
// this shows that staff never reach it: no button, and the page says why.
test("an animal that died offers no re-intake, and the re-intake page says why", async ({ browser }) => {
  const f = await fixture(false, true);
  const context = await browser.newContext({ storageState: states.staff });
  const page = await context.newPage();
  try {
    await page.goto(`/dashboard/animals/${f.animalId}`);
    await expect(page.getByText("Outcome: Deceased", { exact: true })).toBeVisible();
    await expect(page.getByText("An animal that has died can't be taken back in. If the outcome was recorded by mistake, an admin can reverse it from the Outcomes list, which puts the animal back in care.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Re-Intake" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create Outcome" })).toHaveCount(0);
    await page.goto(`/dashboard/animals/${f.animalId}/intake/create`);
    await expect(page.getByRole("heading", { name: "Cannot Process Re-Intake", exact: true })).toBeVisible();
    await expect(page.getByText(`This animal, ${f.name}, can't be processed for re-intake because its outcome was Deceased.`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Process Re-Intake" })).toHaveCount(0);
  } finally { await context.close(); await cleanup(f); }
});

test("an account with no outcome access sees the same 403 page on the edit and create URLs as on the list", async ({ browser }) => {
  const f = await fixture(false, true);
  const context = await browser.newContext({ storageState: states.foster });
  const page = await context.newPage();
  try {
    for (const path of ["/dashboard/outcomes", `/dashboard/outcomes/${f.outcomeId}/edit`, `/dashboard/outcomes/create?animalId=${f.animalId}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Access Denied" }), path).toBeVisible();
      await expect(page.getByText("Something Went Wrong"), path).toHaveCount(0);
    }
  } finally { await context.close(); await cleanup(f); }
});

test("seeded clinical records, retained reversal and legacy gaps are readable on both surfaces", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const examples = await withDb(async (db) => {
    await db.query("BEGIN READ ONLY");
    const linked = await db.query<{ outcomeId: string; animalId: string; name: string; kind: string; reversed: boolean }>(`
      SELECT o.id AS "outcomeId", a.id AS "animalId", a.name, e.kind, o."reversedAt" IS NOT NULL AS reversed
      FROM outcomes o JOIN animals a ON a.id = o."animalId" JOIN medical_entries e ON e.outcome_id = o.id
      ORDER BY e.kind, a.name, a.id`);
    const legacy = await db.query<{ outcomeId: string; animalId: string; name: string }>(`
      SELECT o.id AS "outcomeId", a.id AS "animalId", a.name FROM outcomes o JOIN animals a ON a.id = o."animalId"
      LEFT JOIN medical_entries e ON e.outcome_id = o.id
      WHERE o.type IN ('DECEASED', 'EUTHANIZED') AND o."reversedAt" IS NULL AND e.id IS NULL
      ORDER BY a.name, a.id LIMIT 1`);
    await db.query("COMMIT");
    return { linked: linked.rows, legacy: legacy.rows[0] };
  });
  expect(examples.linked).toHaveLength(3);
  expect(examples.legacy).toBeDefined();
  const context = await browser.newContext({ storageState: states.staff });
  const page = await context.newPage();
  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const example of examples.linked) {
        const label = example.kind === "DEATH" ? "Death" : "Euthanasia";
        const key = example.reversed ? "reversed" : example.kind.toLowerCase();
        for (const surface of ["outcome", "history"]) {
          await page.goto(surface === "outcome"
            ? `/dashboard/outcomes/${example.outcomeId}/edit`
            : `/dashboard/animals/${example.animalId}/medical/history?kind=${example.kind}`);
          const entry = page.getByRole("listitem", { name: new RegExp(`^${label},`) });
          await expect(entry).toBeVisible();
          await expect(entry).toContainText("Recorded by Olivia Chen");
          if (example.kind === "DEATH") {
            await expect(entry).toContainText("Cause: Unknown");
            await expect(entry).toContainText("Necropsy requested: Unknown");
            await expect(entry).toContainText("Found dead");
          } else {
            await expect(entry).toContainText("Pentobarbital");
            await expect(entry).toContainText("4 mL");
            await expect(entry).toContainText("Intravenous");
          }
          if (example.reversed) {
            await expect(entry).toContainText("Voided");
            await entry.getByRole("button", { name: "Show 1 change", exact: true }).click();
            await expect(entry.getByRole("list", { name: "Change history" })).toContainText("Recorded against the wrong animal");
            if (surface === "outcome") await expect(page.getByRole("heading", { name: "Outcome Reversed", exact: true })).toBeVisible();
          }
          if (example.kind === "EUTHANASIA") {
            const document = entry.getByRole("link", { name: example.reversed ? "Retained outcome paperwork" : "Euthanasia clinical record", exact: true });
            await expect(document).toBeVisible();
            const response = await context.request.get((await document.getAttribute("href"))!);
            expect(response.status()).toBe(200);
            expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
          }
          if (surface === "history") await expect(page.getByText(example.name, { exact: true }).first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`seeded-${key}-${surface}-${width}.png`), fullPage: true });
        }
      }
      await page.goto(`/dashboard/outcomes/${examples.legacy.outcomeId}/edit`);
      await expect(page.getByText("Medical details not recorded", { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add medical details", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`seeded-legacy-outcome-${width}.png`), fullPage: true });
      await page.goto(`/dashboard/animals/${examples.legacy.animalId}/medical/history`);
      await expect(page.getByText(examples.legacy.name, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("listitem", { name: /^(Death|Euthanasia),/ })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`seeded-legacy-history-${width}.png`), fullPage: true });
    }
  } finally { await context.close(); }
});
