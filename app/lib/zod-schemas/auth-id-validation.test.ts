/**
 * Guards the boundary between the two id spaces in this app:
 *
 *   - Prisma-generated ids (Person, Animal, Task, ...) are CUIDs, from
 *     `@default(cuid())`.
 *   - Better Auth-generated ids (User, Session, Account, Verification) are
 *     32-character random base62 strings. Better Auth supplies the id on
 *     insert, so the `@default(cuid())` in schema.prisma never fires for
 *     those tables — the column looks like it holds CUIDs and does not.
 *
 * Validating a Better Auth id with `cuidSchema` rejects it as soon as the
 * random string contains an uppercase letter, which is almost always.
 * Runs under `npm test` (tsx --test "app/&#42;&#42;/*.test.ts"). No DB needed.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { authIdSchema, cuidSchema } from "@/app/lib/zod-schemas/common.schemas";

// ──────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────

const BASE62 =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Deterministic stand-in for Better Auth's default id generator. */
function betterAuthStyleId(seed: number, size = 32): string {
  let state = seed * 2654435761 + 1;
  let out = "";
  for (let i = 0; i < size; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out += BASE62[state % BASE62.length];
  }
  return out;
}

/** A real id from a Better Auth deployment, kept verbatim as a regression case. */
const REAL_BETTER_AUTH_ID = "MRaM1HgFyo99l6YHkVlNRBC5YumDmEtU";

/** Shape of a Prisma `@default(cuid())` value (CUID v1). */
const PRISMA_CUID = "cjld2cjxh0000qzrmn831i7rn";

// ──────────────────────────────────────────────────────────────
// Schema behaviour
// ──────────────────────────────────────────────────────────────

describe("authIdSchema", () => {
  test("accepts Better Auth generated ids", () => {
    for (let seed = 0; seed < 500; seed++) {
      const id = betterAuthStyleId(seed);
      const result = authIdSchema.safeParse(id);
      assert.equal(
        result.success,
        true,
        `authIdSchema rejected a Better Auth style id: ${id}`,
      );
    }
  });

  test("accepts a real Better Auth id", () => {
    assert.equal(authIdSchema.safeParse(REAL_BETTER_AUTH_ID).success, true);
  });

  test("still accepts Prisma CUIDs, so it is safe as a general id schema", () => {
    assert.equal(authIdSchema.safeParse(PRISMA_CUID).success, true);
  });

  test("rejects empty, whitespace-only, and oversized input", () => {
    for (const bad of ["", "   ", "\n", "x".repeat(65)]) {
      assert.equal(
        authIdSchema.safeParse(bad).success,
        false,
        `authIdSchema accepted junk input: ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("cuidSchema", () => {
  test("rejects Better Auth ids — this is why authIdSchema exists", () => {
    // If this ever starts passing, the id space changed (e.g. Better Auth was
    // configured with a custom generateId). Re-read this file before deleting it.
    assert.equal(
      cuidSchema.safeParse(REAL_BETTER_AUTH_ID).success,
      false,
      "cuidSchema accepted a Better Auth id — the assumption behind authIdSchema no longer holds",
    );
  });

  test("accepts Prisma generated ids", () => {
    assert.equal(cuidSchema.safeParse(PRISMA_CUID).success, true);
  });
});

// ──────────────────────────────────────────────────────────────
// Static guard: no auth-owned id may be validated as a CUID
// ──────────────────────────────────────────────────────────────

/**
 * Fields that hold a Better Auth-generated id. Person-scoped ids
 * (actorId, assigneeId, changedById, recordedById, ...) are deliberately
 * absent — those really are Prisma CUIDs.
 */
const AUTH_OWNED_ID_FIELDS = [
  "userId",
  "sessionId",
  "accountId",
  "verificationId",
];

const SCAN_ROOTS = ["app", "components", "lib"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "generated",
  "dist",
  "test-results",
]);

const OFFENDING_PATTERN = new RegExp(
  String.raw`\b(${AUTH_OWNED_ID_FIELDS.join("|")})\s*:\s*(cuidSchema|z\.cuid2?\(\))`,
);

function* sourceFiles(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // root not present in this checkout
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* sourceFiles(full);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      yield full;
    }
  }
}

describe("id validation conventions", () => {
  test("no auth-owned id is validated with a CUID schema", () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(path.resolve(process.cwd(), root))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (OFFENDING_PATTERN.test(line)) {
            offenders.push(
              `${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`,
            );
          }
        });
      }
    }

    assert.deepEqual(
      offenders,
      [],
      [
        "Better Auth ids are not CUIDs. Use authIdSchema for these fields:",
        ...offenders.map((o) => `  ${o}`),
      ].join("\n"),
    );
  });
});
