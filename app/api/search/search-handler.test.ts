import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { can } from "@/app/lib/auth/can";
import {
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_GROUPS,
  type GlobalSearchGroup,
} from "@/app/lib/data/search/global-search";
import type { Guide } from "@/app/lib/guides/guides";
import { createSearchHandler, type SearchResponse } from "./search-handler";

const fakeGuide = (
  slug: string,
  permissions: Guide["permissions"],
  title = slug,
): Guide => ({
  slug,
  title,
  summary: `About ${title}.`,
  permissions,
  aliases: [],
  related: [],
  verified: "2026-11-09",
  body: "Steps.",
});

// A volunteer holds MEDICAL_READ but neither MEDICAL_MANAGE nor
// OUTCOMES_MANAGE; staff hold all three.
const GUIDES: Guide[] = [
  fakeGuide("vaccine-read", ["MEDICAL_READ"], "Read vaccine history"),
  fakeGuide("vaccine-batch", ["MEDICAL_MANAGE"], "Batch vaccine entry"),
  fakeGuide("vaccine-outcome", ["OUTCOMES_MANAGE"], "Vaccine before an outcome"),
];

// A handler for a caller with the given role (or no session), recording the
// arguments of every search it runs.
const handlerFor = (role: Role | null, guides: Guide[] = GUIDES) => {
  const searches: { query: string; groups: readonly GlobalSearchGroup[] }[] = [];
  const handler = createSearchHandler({
    getSession: async () => (role ? { user: { role } } : null),
    hasPermission: async (permission) => can(role, permission),
    search: async (query, groups) => {
      searches.push({ query, groups });
      return emptyGlobalSearchResults(groups);
    },
    getGuides: async () => guides,
  });
  return { handler, searches };
};

const helpSlugs = async (res: Response) =>
  ((await res.json()) as SearchResponse).help?.map((hit) => hit.slug) ?? null;

const get = (q: string) =>
  new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);

test("401 without a session", async () => {
  const { handler, searches } = handlerFor(null);
  const res = await handler(get("bella"));

  assert.equal(res.status, 401);
  assert.equal(searches.length, 0);
});

test("403 for a USER-role session", async () => {
  const { handler, searches } = handlerFor(Role.USER);
  const res = await handler(get("bella"));

  assert.equal(res.status, 403);
  assert.equal(searches.length, 0);
});

test("a 1-character query returns empty groups without searching", async () => {
  const { handler, searches } = handlerFor(Role.STAFF);
  const res = await handler(get(" b "));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ...emptyGlobalSearchResults(GLOBAL_SEARCH_GROUPS),
    help: [],
  });
  assert.equal(searches.length, 0);
});

test("a volunteer searches every group, with the trimmed query", async () => {
  const { handler, searches } = handlerFor(Role.VOLUNTEER);
  const res = await handler(get("  bella  "));

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(searches, [{ query: "bella", groups: GLOBAL_SEARCH_GROUPS }]);
  const body = await res.json();
  for (const group of GLOBAL_SEARCH_GROUPS) {
    assert.deepEqual(body[group], [], group);
  }
});

test("a query over 100 characters is rejected", async () => {
  const { handler, searches } = handlerFor(Role.STAFF);
  const res = await handler(get("x".repeat(101)));

  assert.equal(res.status, 400);
  assert.equal(searches.length, 0);
});

test("a failing search returns 500", async () => {
  const handler = createSearchHandler({
    getSession: async () => ({ user: { role: Role.STAFF } }),
    hasPermission: async (permission) => can(Role.STAFF, permission),
    search: async () => {
      throw new Error("db down");
    },
    getGuides: async () => GUIDES,
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await handler(get("bella"));
    assert.equal(res.status, 500);
  } finally {
    console.error = originalError;
  }
});

test("the Help group holds only the guides the caller can see", async () => {
  const staff = await handlerFor(Role.STAFF).handler(get("vaccine"));
  assert.equal(staff.status, 200);
  assert.deepEqual(
    new Set(await helpSlugs(staff)),
    new Set(["vaccine-read", "vaccine-batch", "vaccine-outcome"]),
  );

  const volunteer = await handlerFor(Role.VOLUNTEER).handler(get("vaccine"));
  assert.deepEqual(await helpSlugs(volunteer), ["vaccine-read"]);
});

test("a Help row carries the slug, title and summary, and no body", async () => {
  const res = await handlerFor(Role.VOLUNTEER).handler(get("history"));
  const body = (await res.json()) as SearchResponse;
  assert.deepEqual(body.help, [
    {
      slug: "vaccine-read",
      title: "Read vaccine history",
      summary: "About Read vaccine history.",
    },
  ]);
});

test("a caller who can search but sees no guides gets no Help group, and no error", async () => {
  const onlyStaffGuides = [fakeGuide("outcome", ["OUTCOMES_MANAGE"])];
  const { handler, searches } = handlerFor(Role.VOLUNTEER, onlyStaffGuides);

  const res = await handler(get("outcome"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as SearchResponse;
  assert.equal(body.help, null);
  assert.deepEqual(body.animals, []);
  assert.equal(searches.length, 1);

  const short = await handler(get("o"));
  assert.equal(((await short.json()) as SearchResponse).help, null);
});

test("a palette search that matches no guide logs nothing: the query may be a person's name", async () => {
  const lines: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => lines.push(args);
  try {
    const res = await handlerFor(Role.STAFF).handler(get("Jane Smith"));
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as SearchResponse).help, []);
  } finally {
    console.info = originalInfo;
  }
  assert.deepEqual(lines, []);
});

test("guides don't widen who gets the palette: a USER-role caller still gets 403", async () => {
  // A foster's guide is visible to USER, but USER can search no record group.
  const { handler } = handlerFor(Role.USER, [
    fakeGuide("foster", ["MY_FOSTER_ANIMALS_CARE"]),
  ]);
  assert.equal((await handler(get("foster"))).status, 403);
});

test("guides that fail to load leave out the Help group, not the records", async () => {
  const handler = createSearchHandler({
    getSession: async () => ({ user: { role: Role.STAFF } }),
    hasPermission: async (permission) => can(Role.STAFF, permission),
    search: async (_query, groups) => emptyGlobalSearchResults(groups),
    getGuides: async () => {
      throw new Error("bad guide");
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await handler(get("bella"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as SearchResponse;
    assert.equal(body.help, null);
    assert.deepEqual(body.animals, []);
  } finally {
    console.error = originalError;
  }
});
