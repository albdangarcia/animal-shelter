import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import type { Actor } from "@/app/lib/auth/actor";
import type { Guide } from "@/app/lib/guides/guides";
import { GUIDE_SEARCH_NO_RESULTS_EVENT } from "@/app/lib/guides/search";
import { GUIDES_UNAVAILABLE } from "./guide-access";
import { runReadGuide } from "./read-guide";
import { runSearchGuides, SEARCH_GUIDES_LIMIT } from "./search-guides";

function guide(slug: string, overrides: Partial<Guide> = {}): Guide {
  return {
    slug,
    title: slug,
    summary: `About ${slug}.`,
    permissions: ["MEDICAL_READ"],
    aliases: [],
    related: [],
    verified: "2026-11-09",
    body: "Open the page and follow the steps.",
    ...overrides,
  };
}

// Each guide's first alias is a word no other guide has, so searching it
// names that guide alone.
const glossary = guide("glossary", {
  title: "Glossary",
  permissions: ["MEDICAL_READ"],
  aliases: ["lexicon"],
  body: "## Overdue\n\nPast its date.",
});
const vaccine = guide("vaccine", {
  title: "Record a vaccine",
  permissions: ["MEDICAL_ADMINISTER", "MEDICAL_MANAGE"],
  aliases: ["inoculate", "give a shot"],
  related: ["glossary", "protocols", "foster"],
  body: [
    "Click **Record care**. See [what Overdue means](./glossary.md#overdue).",
    "An admin sets [the protocols](./protocols.md) first.",
    "Other sites stay as written: [the vet](https://example.com/vet).",
  ].join("\n\n"),
});
const protocols = guide("protocols", {
  title: "Set up vaccine protocols",
  permissions: ["MEDICAL_SETTINGS_MANAGE"],
  aliases: ["catalog"],
});
const foster = guide("foster", {
  title: "Fosters: give care",
  permissions: ["MY_FOSTER_ANIMALS_CARE"],
  aliases: ["homestay"],
});
const guides = [glossary, vaccine, protocols, foster];

const as = (role: string): Actor => ({ userId: "u1", personId: "p1", role });
const deps = (list: Guide[] = guides, log: (line: string) => void = () => {}) => ({
  loadGuides: async () => list,
  log,
});

const searchSlugs = async (role: string, query: string) => {
  const result = await runSearchGuides({ query }, as(role), deps());
  assert.ok(result.ok, JSON.stringify(result));
  return result.results.map((hit) => hit.slug).sort();
};

const readSlug = async (role: string, slug: string) => {
  const result = await runReadGuide({ slug }, as(role), deps());
  assert.ok(result.ok, JSON.stringify(result));
  return result.guide?.slug ?? null;
};

test("each role finds and reads only the guides it can see", async () => {
  const expected: Record<string, string[]> = {
    [Role.VOLUNTEER]: ["foster", "glossary"],
    [Role.STAFF]: ["foster", "glossary", "vaccine"],
    [Role.ADMIN]: ["foster", "glossary", "protocols", "vaccine"],
  };
  for (const [role, visible] of Object.entries(expected)) {
    for (const g of guides) {
      const sees = visible.includes(g.slug);
      assert.deepEqual(
        await searchSlugs(role, g.aliases[0]),
        sees ? [g.slug] : [],
        `${role} searching "${g.aliases[0]}"`,
      );
      assert.equal(await readSlug(role, g.slug), sees ? g.slug : null, `${role} reading ${g.slug}`);
    }
  }
});

test("a role without the chat gets a refusal, not guides", async () => {
  const search = await runSearchGuides({ query: "foster" }, as(Role.USER), deps());
  const read = await runReadGuide({ slug: "foster" }, as(Role.USER), deps());
  assert.deepEqual(search, { ok: false, reason: "You do not have permission to use this tool." });
  assert.deepEqual(read, search);
});

test("a hidden slug and a missing slug get identical results", async () => {
  const hidden = await runReadGuide({ slug: "protocols" }, as(Role.STAFF), deps());
  const missing = await runReadGuide({ slug: "no-such-guide" }, as(Role.STAFF), deps());
  assert.deepEqual(hidden, { ok: true, guide: null });
  assert.deepEqual(hidden, missing);

  // The hidden guide's own words find nothing, exactly like nonsense does.
  const hiddenWords = await runSearchGuides({ query: "catalog" }, as(Role.STAFF), deps());
  const nonsense = await runSearchGuides({ query: "zzqxv" }, as(Role.STAFF), deps());
  assert.deepEqual(hiddenWords, { ok: true, results: [] });
  assert.deepEqual(hiddenWords, nonsense);
});

test("readGuide sends links to the help pages and filters related to what the reader can see", async () => {
  const result = await runReadGuide({ slug: "vaccine" }, as(Role.STAFF), deps());
  assert.ok(result.ok && result.guide);
  const { guide: read } = result;

  assert.deepEqual(
    { slug: read.slug, title: read.title, summary: read.summary, verified: read.verified },
    { slug: "vaccine", title: "Record a vaccine", summary: "About vaccine.", verified: "2026-11-09" },
  );
  assert.equal(
    read.body,
    [
      "Click **Record care**. See [what Overdue means](/dashboard/help/glossary#overdue).",
      // Staff can't see the admin guide: its text stays, its slug goes.
      "An admin sets the protocols first.",
      "Other sites stay as written: [the vet](https://example.com/vet).",
    ].join("\n\n"),
  );
  assert.doesNotMatch(read.body, /protocols\.md|help\/protocols/);
  assert.deepEqual(read.linkedGuides, ["glossary"]);
  assert.deepEqual(read.related, [
    { slug: "glossary", title: "Glossary" },
    { slug: "foster", title: "Fosters: give care" },
  ]);

  const asAdmin = await runReadGuide({ slug: "vaccine" }, as(Role.ADMIN), deps());
  assert.ok(asAdmin.ok && asAdmin.guide);
  assert.match(asAdmin.guide.body, /\[the protocols\]\(\/dashboard\/help\/protocols\)/);
  assert.deepEqual(asAdmin.guide.linkedGuides, ["glossary", "protocols"]);
  assert.deepEqual(
    asAdmin.guide.related.map((g) => g.slug),
    ["glossary", "protocols", "foster"],
  );
});

test("an actor who can see no guides gets an empty result, not an error", async () => {
  const adminOnly = deps([protocols]);
  assert.deepEqual(
    await runSearchGuides({ query: "vaccine protocols" }, as(Role.STAFF), adminOnly),
    { ok: true, results: [] },
  );
  assert.deepEqual(
    await runReadGuide({ slug: "protocols" }, as(Role.STAFF), adminOnly),
    { ok: true, guide: null },
  );
});

test("a search no guide answers is logged with the assistant surface", async () => {
  const lines: string[] = [];
  await runSearchGuides({ query: "reset my password" }, as(Role.STAFF), deps(guides, (line) => lines.push(line)));
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: GUIDE_SEARCH_NO_RESULTS_EVENT,
    surface: "assistant",
    query: "reset my password",
    fallback_hits: 0,
  });

  // A search that finds its guide logs nothing.
  lines.length = 0;
  await runSearchGuides({ query: "give a shot" }, as(Role.STAFF), deps(guides, (line) => lines.push(line)));
  assert.deepEqual(lines, []);
});

test("search returns at most five hits, each a slug, title and summary", async () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    guide(`kennel-${i}`, { title: `Kennel ${i}`, permissions: ["MEDICAL_READ"] }),
  );
  const result = await runSearchGuides({ query: "kennel" }, as(Role.VOLUNTEER), deps(many));
  assert.ok(result.ok);
  assert.equal(result.results.length, SEARCH_GUIDES_LIMIT);
  assert.deepEqual(Object.keys(result.results[0]).sort(), ["slug", "summary", "title"]);
});

test("a guide store that fails to load gives a plain failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const broken = { loadGuides: async (): Promise<Guide[]> => { throw new Error("bad front matter"); } };
  const search = await runSearchGuides({ query: "vaccine" }, as(Role.STAFF), broken);
  const read = await runReadGuide({ slug: "vaccine" }, as(Role.STAFF), broken);
  assert.deepEqual(search, { ok: false, reason: GUIDES_UNAVAILABLE });
  assert.deepEqual(read, search);
});

test("against the real guides, staff find and read the vaccine guide", async () => {
  const staff = as(Role.STAFF);
  const search = await runSearchGuides({ query: "record rabies vaccine" }, staff, { log: () => {} });
  assert.ok(search.ok);
  // Among the first two: the rabies certificate guide's aliases say "rabies"
  // twice, so today it ranks first for this query, and the model picks
  // between the two by their summaries.
  assert.ok(
    search.results.slice(0, 2).some((hit) => hit.slug === "record-a-vaccine-test-or-treatment"),
    JSON.stringify(search.results),
  );

  const read = await runReadGuide({ slug: "record-a-vaccine-test-or-treatment" }, staff);
  assert.ok(read.ok && read.guide);
  assert.doesNotMatch(read.guide.body, /\]\(\.\/[^)]*\.md/);
  assert.match(read.guide.body, /\]\(\/dashboard\/help\/schedule-care-and-read-the-due-page\)/);
});
