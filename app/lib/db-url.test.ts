import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDatabaseUrl } from "./db-url";

// DATABASE_URL and DATABASE_URL_UNPOOLED are both set to
// real-looking dev values, as they would be in an actual local .env. This
// guards the incident where the e2e harness override lost to the dev
// environment's own variables and the e2e seed overwrote the dev database
// with 150 animals. (The original scenario keyed this on the now-removed
// POSTGRES_URL — that variable is gone, but the invariant it guarded
// survives, retargeted to the two variables that remain.)
const dirty = {
  PLAYWRIGHT_DATABASE_URL: "postgresql://e2e",
  DATABASE_URL: "postgresql://dev-pooled",
  DATABASE_URL_UNPOOLED: "postgresql://dev-direct",
} as unknown as NodeJS.ProcessEnv;

test("harness override wins in both modes even when other URL variables are set", () => {
  assert.equal(resolveDatabaseUrl("pooled", dirty), "postgresql://e2e");
  assert.equal(resolveDatabaseUrl("direct", dirty), "postgresql://e2e");
});

test("pooled and direct are not interchangeable", () => {
  const { PLAYWRIGHT_DATABASE_URL: _override, ...rest } = dirty;
  assert.equal(resolveDatabaseUrl("pooled", rest), "postgresql://dev-pooled");
  assert.equal(resolveDatabaseUrl("direct", rest), "postgresql://dev-direct");
});

test("empty string throws in both modes", () => {
  // Deleted: "empty strings fall through". Pooled mode used to have two
  // candidates (POSTGRES_URL, then DATABASE_URL), so an empty first
  // candidate fell through to the second. Collapsed to one candidate per
  // mode, there is nothing left to fall through to — empty string must
  // throw exactly like unset.
  assert.throws(() =>
    resolveDatabaseUrl("pooled", {
      DATABASE_URL: "",
    } as unknown as NodeJS.ProcessEnv),
  );
  assert.throws(() =>
    resolveDatabaseUrl("direct", {
      DATABASE_URL_UNPOOLED: "",
    } as unknown as NodeJS.ProcessEnv),
  );
});

test("direct mode throws when DATABASE_URL_UNPOOLED is absent, naming the variable", () => {
  assert.throws(
    () => resolveDatabaseUrl("direct", {} as unknown as NodeJS.ProcessEnv),
    /DATABASE_URL_UNPOOLED/,
  );
});
