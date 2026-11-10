import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { loadGuides, type Guide } from "./guides";
import { GUIDE_SEARCH_NO_RESULTS_EVENT, searchGuides } from "./search";
import { visibleGuides } from "./visibility";

function guide(slug: string, overrides: Partial<Guide> = {}): Guide {
  return {
    slug,
    title: slug,
    summary: "Something else entirely.",
    permissions: ["MEDICAL_READ"],
    aliases: [],
    related: [],
    verified: "2026-11-09",
    body: "Open the page and follow the steps.",
    ...overrides,
  };
}

const quiet = { surface: "help" as const, log: () => {} };
const slugs = (query: string, guides: Guide[], limit?: number) =>
  searchGuides(query, guides, { ...quiet, limit }).map((hit) => hit.slug);

const realGuides = () => loadGuides(path.join(process.cwd(), "docs/guides"));

test("staff's own words find the guide through its aliases", async () => {
  const guides = await realGuides();
  assert.equal(slugs("give a shot", guides)[0], "record-a-vaccine-test-or-treatment");
  assert.equal(slugs("how do I give a shot", guides)[0], "record-a-vaccine-test-or-treatment");
  assert.equal(slugs("med sheet", guides)[0], "order-a-medication-and-record-doses");
});

test("a typo still finds the guide", async () => {
  const guides = await realGuides();
  assert.equal(slugs("vacine", guides)[0], "record-a-vaccine-test-or-treatment");
  assert.equal(slugs("microhcip", guides)[0], "record-or-correct-a-microchip");
  assert.ok(
    slugs("shedule care", guides).slice(0, 3).includes("schedule-care-and-read-the-due-page"),
  );
});

test("a short word must be spelled right", () => {
  // "care" one letter off "are" (and "dose" off "does") would match half of
  // every guide.
  const guides = [guide("are", { title: "Are you sure" })];
  assert.deepEqual(slugs("care", guides), []);
});

test("the word being typed matches as a prefix", () => {
  const guides = [guide("vaccine", { title: "Record a vaccine" })];
  assert.deepEqual(slugs("vacc", guides), ["vaccine"]);
});

test("a match in the title or aliases outranks the summary, which outranks the body", () => {
  const guides = [
    guide("in-body", { body: "Check for parvo before the steps." }),
    guide("in-summary", { summary: "What to do about parvo." }),
    guide("in-title", { title: "Parvo" }),
  ];
  assert.deepEqual(slugs("parvo", guides), ["in-title", "in-summary", "in-body"]);

  const aliased = [
    guide("in-summary", { summary: "What to do about parvo." }),
    guide("in-aliases", { aliases: ["parvo"] }),
  ];
  assert.deepEqual(slugs("parvo", aliased), ["in-aliases", "in-summary"]);
});

test("a guide with every word comes first; with none that has them all, any word matches", () => {
  const guides = [
    guide("rabies-only", { title: "Rabies" }),
    guide("both", { title: "Rabies certificate" }),
  ];
  assert.deepEqual(slugs("rabies certificate", guides), ["both"]);
  assert.deepEqual(slugs("rabies passport", guides).sort(), ["both", "rabies-only"]);
});

test("search filters to the guides the reader can see before ranking", () => {
  // Five guides the reader can't see match better than the one they can.
  const hidden = Array.from({ length: 5 }, (_, i) =>
    guide(`hidden-${i}`, {
      title: "Vaccine vaccine",
      aliases: ["vaccine"],
      permissions: ["MEDICAL_MANAGE"],
    }),
  );
  const shown = guide("shown", { body: "Mentions a vaccine once." });
  const visible = visibleGuides([...hidden, shown], [AppPermissions.MEDICAL_READ]);

  assert.deepEqual(slugs("vaccine", visible, 1), ["shown"]);
});

test("a hit carries the slug, title and summary only", () => {
  const [hit] = searchGuides("exam", [guide("exam", { title: "Record an exam" })], quiet);
  assert.deepEqual(hit, {
    slug: "exam",
    title: "Record an exam",
    summary: "Something else entirely.",
  });
});

test("a search with no results logs one line with the query and surface, and no user", () => {
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const guides = [guide("exam", { title: "Record an exam" })];

  assert.deepEqual(searchGuides("  kennel cough  ", guides, { surface: "help", log }), []);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: GUIDE_SEARCH_NO_RESULTS_EVENT,
    surface: "help",
    query: "kennel cough",
    fallback_hits: 0,
  });
  assert.equal(GUIDE_SEARCH_NO_RESULTS_EVENT, "guides.search.no_results");

  searchGuides("exam", guides, { surface: "help", log });
  searchGuides("record exam", guides, { surface: "help", log });
  searchGuides("   ", guides, { surface: "help", log });
  assert.equal(lines.length, 1, "a guide with every word, or an empty query, logs nothing");
});

test("a query only the any-word fallback answers is still a miss, logged with how many guesses it showed", () => {
  // "reset my password" found the vet-visit report guide through "report"
  // and logged nothing, hiding the questions the guides don't answer.
  const lines: string[] = [];
  const guides = [
    guide("report", { title: "Report a vet visit" }),
    guide("print", { title: "Print a report" }),
    guide("exam", { title: "Record an exam" }),
  ];

  const hits = searchGuides("export report", guides, {
    surface: "help",
    log: (line) => lines.push(line),
  });

  assert.deepEqual(hits.map((hit) => hit.slug).sort(), ["print", "report"]);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: GUIDE_SEARCH_NO_RESULTS_EVENT,
    surface: "help",
    query: "export report",
    fallback_hits: 2,
  });
});

test("a palette miss is not logged: its query is usually a record lookup", () => {
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const guides = [guide("exam", { title: "Record an exam" })];

  for (const query of ["Jane Smith", "555-0101", "985112345678901", "bella"]) {
    assert.deepEqual(searchGuides(query, guides, { surface: "palette", log }), [], query);
  }
  assert.deepEqual(lines, []);
});

test("in the palette every word must match, with no fall back to any word", () => {
  // "example" is in "for example" in many guide bodies, so an email search
  // matched guides by chance when any word was enough.
  const guides = [
    guide("rabies-only", { title: "Rabies", body: "For example, a booster." }),
    guide("both", { title: "Rabies certificate" }),
  ];
  const palette = (query: string) =>
    searchGuides(query, guides, { surface: "palette", log: () => {} }).map((hit) => hit.slug);

  assert.deepEqual(palette("jane@example.com"), []);
  assert.deepEqual(palette("rabies passport"), []);
  assert.deepEqual(palette("rabies certificate"), ["both"]);
  // The Help page still falls back.
  assert.deepEqual(slugs("jane@example.com", guides), ["rabies-only"]);
});

test("a query of stop words or punctuation alone searches nothing and logs nothing", () => {
  const lines: string[] = [];
  const guides = [guide("exam", { title: "Record an exam" })];
  for (const query of ["how do I", "the", "what is it?", "???", " - / "]) {
    assert.deepEqual(
      searchGuides(query, guides, { surface: "help", log: (line) => lines.push(line) }),
      [],
      query,
    );
  }
  assert.deepEqual(lines, []);
});

test("a reader who sees no guides gets no results, and the miss is logged", () => {
  const lines: string[] = [];
  assert.deepEqual(
    searchGuides("vaccine", [], { surface: "help", log: (line) => lines.push(line) }),
    [],
  );
  assert.equal(lines.length, 1);
});
