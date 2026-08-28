import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AiProviderConfigError,
  assertAiProviderAllowed,
  parseAiProviderTier,
} from "./provider-guard";

const LOCAL_URL = "postgresql://postgres:pw@127.0.0.1:5432/postgres";
const NEON_URL =
  "postgresql://user:pw@ep-x-pooler.us-east-2.aws.neon.tech/db?sslmode=require";

test("parseAiProviderTier: unset / blank defaults to free", () => {
  assert.equal(parseAiProviderTier(undefined), "free");
  assert.equal(parseAiProviderTier(""), "free");
  assert.equal(parseAiProviderTier("  "), "free");
});

test("parseAiProviderTier: accepts free/paid case- and space-insensitively", () => {
  assert.equal(parseAiProviderTier("free"), "free");
  assert.equal(parseAiProviderTier("PAID"), "paid");
  assert.equal(parseAiProviderTier(" paid "), "paid");
});

test("parseAiProviderTier: rejects anything else", () => {
  assert.throws(() => parseAiProviderTier("paidd"), AiProviderConfigError);
  assert.throws(() => parseAiProviderTier("trial"), AiProviderConfigError);
});

test("assertAiProviderAllowed: free tier is fine against a local database", () => {
  assert.doesNotThrow(() =>
    assertAiProviderAllowed({ tier: "free", databaseUrl: LOCAL_URL }),
  );
});

test("assertAiProviderAllowed: free tier against a networked database throws", () => {
  assert.throws(
    () => assertAiProviderAllowed({ tier: "free", databaseUrl: NEON_URL }),
    AiProviderConfigError,
  );
});

test("assertAiProviderAllowed: paid tier allows any database", () => {
  assert.doesNotThrow(() =>
    assertAiProviderAllowed({ tier: "paid", databaseUrl: NEON_URL }),
  );
});
