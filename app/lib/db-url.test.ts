import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDatabaseUrl } from "./db-url";

const dirty = {
  PLAYWRIGHT_DATABASE_URL: "postgresql://e2e",
  POSTGRES_URL: "postgresql://dev-pooled",
  DATABASE_URL: "postgresql://dev",
  DATABASE_URL_UNPOOLED: "postgresql://dev-direct",
} as unknown as NodeJS.ProcessEnv;

test("harness override wins even when POSTGRES_URL is set", () => {
  assert.equal(resolveDatabaseUrl("pooled", dirty), "postgresql://e2e");
  assert.equal(resolveDatabaseUrl("direct", dirty), "postgresql://e2e");
});

test("pooled and direct are not interchangeable", () => {
  const { PLAYWRIGHT_DATABASE_URL: _, ...neon } = dirty;
  assert.equal(resolveDatabaseUrl("pooled", neon), "postgresql://dev-pooled");
  assert.equal(resolveDatabaseUrl("direct", neon), "postgresql://dev-direct");
});

test("empty strings fall through", () => {
  assert.equal(
    resolveDatabaseUrl("pooled", {
      POSTGRES_URL: "",
      DATABASE_URL: "postgresql://dev",
    } as unknown as NodeJS.ProcessEnv),
    "postgresql://dev",
  );
});
