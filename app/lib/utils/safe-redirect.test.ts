import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDashboardPath, safeInternalPath } from "./safe-redirect";

test("a plain root-relative path is returned unchanged", () => {
  assert.equal(safeInternalPath("/pets", "/"), "/pets");
});

test("a path with a query string is returned unchanged", () => {
  assert.equal(safeInternalPath("/pets?page=2", "/"), "/pets?page=2");
});

test("a path with a hash and percent-encoding is returned unchanged", () => {
  assert.equal(
    safeInternalPath("/pets?q=golden%20retriever#results", "/"),
    "/pets?q=golden%20retriever#results",
  );
});

test("null, undefined, and empty string fall back", () => {
  assert.equal(safeInternalPath(null, "/"), "/");
  assert.equal(safeInternalPath(undefined, "/"), "/");
  assert.equal(safeInternalPath("", "/"), "/");
});

test("a protocol-relative URL falls back", () => {
  assert.equal(safeInternalPath("//evil.com", "/"), "/");
});

test("the backslash spelling of a protocol-relative URL falls back", () => {
  assert.equal(safeInternalPath("/\\evil.com", "/"), "/");
});

test("absolute http and https URLs fall back", () => {
  assert.equal(safeInternalPath("https://evil.com", "/"), "/");
  assert.equal(safeInternalPath("http://evil.com", "/"), "/");
});

test("javascript: and data: schemes fall back", () => {
  assert.equal(safeInternalPath("javascript:alert(1)", "/"), "/");
  assert.equal(
    safeInternalPath("data:text/html,<script>alert(1)</script>", "/"),
    "/",
  );
});

test("a relative path with no leading slash falls back", () => {
  assert.equal(safeInternalPath("pets", "/"), "/");
});

test("a non-root fallback is honored", () => {
  assert.equal(safeInternalPath(null, "/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("//evil.com", "/dashboard"), "/dashboard");
});

const FALLBACK = "/dashboard/fosters";

test("safeDashboardPath: a dashboard path is returned unchanged", () => {
  const tab = "/dashboard/people-directory/abc123/fostering";
  assert.equal(safeDashboardPath(tab, FALLBACK), tab);
  assert.equal(
    safeDashboardPath("/dashboard/animals?page=2", FALLBACK),
    "/dashboard/animals?page=2",
  );
});

test("safeDashboardPath: null, undefined and empty fall back", () => {
  assert.equal(safeDashboardPath(null, FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath(undefined, FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath("", FALLBACK), FALLBACK);
});

test("safeDashboardPath: a same-origin path outside the dashboard falls back", () => {
  assert.equal(safeDashboardPath("/", FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath("/animals", FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath("/api/auth/sign-out", FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath("/dashboard", FALLBACK), FALLBACK);
  assert.equal(safeDashboardPath("/dashboardx/other", FALLBACK), FALLBACK);
});

test("safeDashboardPath: off-origin spellings fall back", () => {
  for (const candidate of [
    "//evil.com/dashboard/x",
    "/\\evil.com",
    "https://evil.com/dashboard/x",
    "javascript:alert(1)",
    "dashboard/fosters",
  ]) {
    assert.equal(safeDashboardPath(candidate, FALLBACK), FALLBACK, candidate);
  }
});

test("safeDashboardPath: a path that resolves out of the dashboard falls back", () => {
  // These start with "/dashboard/" but the browser navigates elsewhere.
  for (const candidate of [
    "/dashboard/../api/auth/sign-out",
    "/dashboard/%2e%2e/x",
    "/dashboard/%2E%2E/x",
    "/dashboard/./../x",
    "/dashboard/..//evil.com",
    "/dashboard/a/../../x",
  ]) {
    assert.equal(safeDashboardPath(candidate, FALLBACK), FALLBACK, candidate);
  }
});

test("safeDashboardPath: dots that stay inside the dashboard are kept", () => {
  assert.equal(
    safeDashboardPath("/dashboard/a/../b", FALLBACK),
    "/dashboard/a/../b",
  );
});

test("a value that is not a string falls back instead of throwing", () => {
  // returnTo comes from a URL or a direct POST: ?returnTo=a&returnTo=b is an
  // array, and a POST can send a number or an object.
  for (const candidate of [
    ["/dashboard/a", "/dashboard/b"],
    42,
    { startsWith: () => true },
    true,
  ]) {
    const value = candidate as unknown as string;
    assert.equal(safeInternalPath(value, "/"), "/");
    assert.equal(safeDashboardPath(value, FALLBACK), FALLBACK);
  }
});
