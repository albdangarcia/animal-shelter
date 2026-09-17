import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { can } from "@/app/lib/auth/can";
import {
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_GROUPS,
  type GlobalSearchGroup,
} from "@/app/lib/data/search/global-search";
import { createSearchHandler } from "./search-handler";

// A handler for a caller with the given role (or no session), recording the
// arguments of every search it runs.
const handlerFor = (role: Role | null) => {
  const searches: { query: string; groups: readonly GlobalSearchGroup[] }[] = [];
  const handler = createSearchHandler({
    getSession: async () => (role ? { user: { role } } : null),
    hasPermission: async (permission) => can(role, permission),
    search: async (query, groups) => {
      searches.push({ query, groups });
      return emptyGlobalSearchResults(groups);
    },
  });
  return { handler, searches };
};

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
  assert.deepEqual(await res.json(), emptyGlobalSearchResults(GLOBAL_SEARCH_GROUPS));
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
