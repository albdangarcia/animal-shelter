import { expect, test, type Locator } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import { bootstrapStorageState, SEEDED_USER_PASSWORD, storageStatePathFor } from "../support/applications";

const states = {
  staff: storageStatePathFor("medical-layout-staff.json"),
  volunteer: storageStatePathFor("medical-layout-volunteer.json"),
};

test.beforeAll(async ({ browser }) => {
  for (const role of ["staff", "volunteer"] as const) {
    await bootstrapStorageState(browser, {
      email: `${role}1@example.com`, password: SEEDED_USER_PASSWORD, storageStatePath: states[role],
    });
  }
});

const sections = [
  { suffix: "", label: "Overview", titles: ["Medical"], table: "medical_entries" },
  { suffix: "/history", label: "History", titles: ["History"], table: "medical_entries" },
  { suffix: "/vaccines-tests", label: "Vaccines & Tests", titles: ["Vaccines & Tests"], table: "medical_entries" },
  { suffix: "/medications", label: "Medications", titles: ["Current orders", "Dose sheet", "Past orders"], table: "medication_orders" },
  { suffix: "/conditions", label: "Conditions", titles: ["Problem list", "Care episodes"], table: "medical_conditions" },
  { suffix: "/vitals", label: "Vitals", titles: ["Vitals"], table: "vitals_logs" },
  { suffix: "/documents", label: "Documents", titles: ["Documents"], table: "medical_documents" },
];

// Compare positions within each card: record counts legitimately change the
// position of subsequent cards. Headers stay stable except when the unavailable
// care-episode action row collapses after loading.
const geometry = (card: Locator) => card.evaluate((element) => {
  const origin = element.getBoundingClientRect();
  return [
    '[data-slot="card-header"]', '[data-slot="card-title"]',
    '[data-slot="card-description"]', '[data-slot="card-content"]',
  ].map((selector) => {
    const rect = element.querySelector(selector)!.getBoundingClientRect();
    return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width,
      height: selector.includes("card-content") ? 0 : rect.height };
  });
});

for (const role of ["staff", "volunteer"] as const) {
  for (const width of [1280, 390, 320]) {
    test(`${role}: medical headers keep their layout and unavailable care actions collapse at ${width}px`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ storageState: states[role], viewport: { width, height: 900 } });
      const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
      await db.connect();
      try {
        const { rows } = await db.query<{ id: string }>('SELECT id FROM animals WHERE name = $1 LIMIT 1', ["Fido"]);
        const { rows: withoutEpisode } = await db.query<{ id: string }>(`
          SELECT a.id FROM animals a WHERE NOT EXISTS (
            SELECT 1 FROM care_episodes e WHERE e.animal_id = a.id
              AND e.voided_at IS NULL AND e.end_date IS NULL
          ) LIMIT 1`);
        const cases = sections.map((section) => ({ ...section, animalId: rows[0].id, caseLabel: section.label }));
        cases.push({ ...sections[4], animalId: withoutEpisode[0].id, caseLabel: "Conditions-no-open-episode" });
        for (const section of cases) {
          const base = `/dashboard/animals/${section.animalId}/medical`;
          const page = await context.newPage();
          try {
            // Load the shared layout before blocking only the target page's query.
            const sibling = section.suffix === "/documents" ? "/history" : "/documents";
            await page.goto(`${base}${sibling}`);
            const initial = page.locator('[data-slot="card"]:visible');
            await expect(initial.locator('[data-slot="card-content"]').last()).toBeVisible();
            await expect(initial.locator('[data-slot="skeleton"]')).toHaveCount(0);
            // Watch the entire transition, including any ancestor fallback
            // shown before the destination's own loading.tsx arrives.
            await page.evaluate((targetPath) => {
              const audit = { snapshots: [] as string[][] };
              const capture = () => {
                if (location.pathname !== targetPath) return;
                const root = document.querySelector('nav[aria-label="Medical sections"]')?.parentElement;
                if (!root) return;
                const visible = (el: Element) => el.getClientRects().length > 0;
                if (![...root.querySelectorAll('[data-slot="skeleton"]')].some(visible)) return;
                audit.snapshots.push([...root.querySelectorAll('[data-slot="card-title"]')]
                  .filter(visible).map((el) => el.textContent!.trim()));
              };
              new MutationObserver(capture).observe(document.body, { childList: true, subtree: true, attributes: true });
              Object.assign(window, { medicalLoadingAudit: audit });
            }, `${base}${section.suffix}`);
            // The checks above pass on the server HTML. A click that lands while
            // React is still hydrating is dropped, and hydration's reveal of the
            // active tab scrolls the row back over the link Playwright scrolled
            // to (only when the row overflows, at 390px and 320px). React marks
            // each node it has attached to, so wait for that on the link.
            const link = page.getByRole("navigation", { name: "Medical sections" }).getByRole("link", { name: section.label, exact: true });
            await expect.poll(() => link.evaluate((el) =>
              Object.keys(el).some((key) => key.startsWith("__reactProps")))).toBe(true);
            await db.query("BEGIN");
            await db.query(`LOCK TABLE ${section.table} IN ACCESS EXCLUSIVE MODE`);
            await link.click();
            const cards = section.titles.map((title) => page.locator('[data-slot="card"]:visible').filter({
              has: page.locator('[data-slot="card-title"]').filter({ hasText: new RegExp(`^${title}$`) }),
            }));
            await expect(cards[0]).toBeVisible();
            await expect(cards[0].locator('[data-slot="skeleton"]')).not.toHaveCount(0);
            const loading = await Promise.all(cards.map(geometry));
            const careActionHeight = section.suffix === "/conditions"
              ? await cards[1].locator('[data-slot="card-header"]').evaluate((header) => {
                  const row = header.lastElementChild!;
                  return row.getBoundingClientRect().height
                    + parseFloat(getComputedStyle(row).marginTop)
                    + parseFloat(getComputedStyle(header).rowGap);
                })
              : 0;
            const observed = await page.evaluate(() =>
              (window as Window & { medicalLoadingAudit?: { snapshots: string[][] } }).medicalLoadingAudit?.snapshots ?? []);
            expect(observed.length, `${section.label}: observed loading headers`).toBeGreaterThan(0);
            for (const snapshot of observed) {
              for (const title of snapshot) expect(section.titles, `${section.label}: wrong fallback header`).toContain(title);
            }
            if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${section.caseLabel}-loading.png`), fullPage: true });
            await db.query("COMMIT");
            await expect(cards[0].locator('[data-slot="skeleton"]')).toHaveCount(0);
            const loaded = await Promise.all(cards.map(geometry));
            for (let card = 0; card < cards.length; card++) {
              if (section.titles[card] === "Care episodes"
                && await cards[card].getByRole("button", { name: "Open care episode", exact: true }).count() === 0) {
                await expect(cards[card].locator('[data-slot="card-header"] > *')).toHaveCount(2);
                loading[card][0].height -= careActionHeight;
                loading[card][3].y -= careActionHeight;
              }
              for (let element = 0; element < loading[card].length; element++) {
                for (const axis of ["x", "y", "width", "height"] as const) {
                  expect(Math.abs(loaded[card][element][axis] - loading[card][element][axis]), `${section.titles[card]}, element ${element}, ${axis}`).toBeLessThanOrEqual(1);
                }
              }
            }
            // Check the headers themselves: unrelated long record actions may
            // overflow at 320px even when the loading header is stable.
            for (const card of cards) {
              expect(await card.locator('[data-slot="card-header"]').evaluate((header) =>
                [header, ...header.querySelectorAll("button, h2")].every((el) =>
                  el.getBoundingClientRect().right <= innerWidth + 1)), section.label).toBe(true);
            }
            if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${section.caseLabel}-loaded.png`), fullPage: true });
          } finally {
            await db.query("ROLLBACK");
            await page.close();
          }
        }
      } finally {
        await db.end();
        await context.close();
      }
    });
  }
}
