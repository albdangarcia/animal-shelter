import { test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath } from "./safe-redirect";

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
