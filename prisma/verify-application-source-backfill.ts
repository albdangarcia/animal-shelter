/**
 * Throwaway proof that the `application_edit_audit_trail` migration's `source`
 * backfill classifies real rows correctly.
 *
 * Why this exists: Playwright provisions its schema with `prisma db push`, so
 * no migration — and no backfill in one — ever runs in the e2e suite, and
 * `npm run db:reset` migrates an empty database before seeding. The UPDATE
 * therefore only does real work via `npm run build`
 * (`prisma migrate deploy && next build`) against a database that already has
 * rows, i.e. unattended, where nobody is watching.
 *
 * This script reads the UPDATE straight out of the committed migration.sql
 * (never a pasted copy — the point is to test the real text), then inside one
 * interactive transaction:
 *   1. adds four probe applications covering every branch of the classifier,
 *      including the orphaned-submitter one that real data will not contain
 *      until a staff member actually leaves,
 *   2. flattens every adoption_applications row to source = 'SELF' (the
 *      pre-migration state on real data),
 *   3. runs the extracted UPDATE,
 *   4. re-derives the expected classification in TypeScript from the history
 *      rows and asserts the column agrees, on the probes and on every real row,
 *   5. throws to force a ROLLBACK, so the dev database is left untouched.
 *
 * The probes are what make this meaningful on a database whose applications
 * were all self-submitted: without them the UPDATE matches nothing and a
 * backfill that classified every row wrongly would still "pass".
 *
 * Run it against the dev database, whose .env* files it reads the same way
 * every prisma:* script does:
 *   npx dotenv run -f .env.local,.env.development,.env -- \
 *     tsx prisma/verify-application-source-backfill.ts
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@/prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrl } from "@/app/lib/db-url";

const MIGRATION_SQL_PATH = path.join(
  // The dotenv wrapper (like every prisma:* script) runs from the repo root.
  process.cwd(),
  "prisma/migrations/20260919174346_application_edit_audit_trail/migration.sql",
);

// The exact string `_staffCreateAdoptionApplication` writes onto the
// submission history row. The migration matches on it and so does the
// expectation below — if the action's wording ever changes, both this script
// and the backfill are talking about a string that no longer exists, and this
// script is where that shows up.
const STAFF_SUBMISSION_REASON =
  "Application submitted by staff on behalf of applicant.";

/**
 * Pull the single UPDATE statement out of the migration file. Strips `--` line
 * comments and splits on `;`, skipping any statement that is not an UPDATE.
 * The one string literal in the file contains neither token.
 */
function extractUpdateStatement(sql: string): string {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");

  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const updates = statements.filter((s) => /^UPDATE\b/i.test(s));
  if (updates.length !== 1) {
    throw new Error(
      `Expected exactly one UPDATE statement in migration.sql, found ${updates.length}.`,
    );
  }
  return updates[0];
}

type SubmissionRow = {
  applicationId: string;
  applicantId: string;
  submitterId: string | null;
  reason: string;
  source: string;
};

// One row per application: its earliest history row — the submission — joined
// to the application. Applications with no history at all are absent, which is
// what the assertions below expect of them.
const SUBMISSION_ROWS_SQL = `
  SELECT DISTINCT ON (h."application_id")
    h."application_id"      AS "applicationId",
    a."applicant_id"        AS "applicantId",
    h."changed_by_id"       AS "submitterId",
    h."statusChangeReason"  AS "reason",
    a."source"::text        AS "source"
  FROM "application_status_history" AS h
  JOIN "adoption_applications" AS a ON a."id" = h."application_id"
  ORDER BY h."application_id", h."changed_at" ASC, h."id" ASC
`;

// Re-derived here rather than read back out of the same UPDATE: an application
// whose submitter is someone other than its applicant was entered by staff,
// and one whose submitter has since been deleted is identifiable only by the
// wording the staff action wrote.
function expectedSource(row: {
  applicantId: string;
  submitterId: string | null;
  reason: string;
}): "SELF" | "STAFF" {
  if (row.submitterId !== null) {
    return row.submitterId === row.applicantId ? "SELF" : "STAFF";
  }
  return row.reason === STAFF_SUBMISSION_REASON ? "STAFF" : "SELF";
}

async function snapshot(
  db: PrismaClient,
): Promise<{ id: string; source: string }[]> {
  return db.adoptionApplication.findMany({
    select: { id: true, source: true },
    orderBy: { id: "asc" },
  });
}

class RollbackSignal extends Error {}

// The four shapes the classifier has to tell apart. `orphaned` drops the
// submitter to NULL after the history row is written, which is what
// ON DELETE SET NULL leaves behind when a staff member's Person row goes.
type Probe = {
  label: string;
  submittedByStaff: boolean;
  orphaned: boolean;
  reason: string;
  expected: "SELF" | "STAFF";
};

const PROBES: Probe[] = [
  {
    label: "staff-entered, submitter still on file",
    submittedByStaff: true,
    orphaned: false,
    reason: STAFF_SUBMISSION_REASON,
    expected: "STAFF",
  },
  {
    label: "staff-entered, submitter since deleted",
    submittedByStaff: true,
    orphaned: true,
    reason: STAFF_SUBMISSION_REASON,
    expected: "STAFF",
  },
  {
    label: "self-submitted",
    submittedByStaff: false,
    orphaned: false,
    reason: "Application submitted by user.",
    expected: "SELF",
  },
  {
    label: "self-submitted, applicant since deleted",
    submittedByStaff: false,
    orphaned: true,
    reason: "Application submitted by user.",
    expected: "SELF",
  },
];

async function main() {
  if (!existsSync(MIGRATION_SQL_PATH)) {
    throw new Error(`migration.sql not found at ${MIGRATION_SQL_PATH}`);
  }

  const updateStatement = extractUpdateStatement(
    readFileSync(MIGRATION_SQL_PATH, "utf8"),
  );
  console.log("── UPDATE statement extracted from migration.sql ──");
  console.log(updateStatement);
  console.log("──────────────────────────────────────────────────\n");

  const adapter = new PrismaPg({
    connectionString: resolveDatabaseUrl("direct"),
  });
  // Touches adoption_applications and application_status_history only, and
  // always rolls back, so no normalization extension applies — in particular
  // it never writes Person.email or User.email.
  const prisma = new PrismaClient({ adapter });

  try {
    const before = await snapshot(prisma);

    // Two existing rows to hang the probes off. They are only referenced, never
    // written, and the transaction is rolled back regardless.
    const [applicant, staffMember] = await prisma.person.findMany({
      orderBy: { id: "asc" },
      take: 2,
      select: { id: true },
    });
    const animal = await prisma.animal.findFirst({
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!applicant || !staffMember || !animal) {
      throw new Error(
        "Need at least two persons and one animal in the database to hang the probes off.",
      );
    }

    let resetCount = 0;
    let updateCount = 0;
    let rows: SubmissionRow[] | null = null;
    const probeIds = new Map<string, string>();

    try {
      await prisma.$transaction(
        async (tx) => {
          // 1. Probe applications, one per branch of the classifier.
          for (const probe of PROBES) {
            const submitterId = probe.submittedByStaff
              ? staffMember.id
              : applicant.id;
            const application = await tx.adoptionApplication.create({
              data: {
                applicantId: applicant.id,
                animalId: animal.id,
                applicantName: "Backfill Probe",
                applicantEmail: "backfill.probe@example.com",
                applicantPhone: "000-000-0000",
                applicantAddressLine1: "1 Probe Lane",
                applicantCity: "Probe City",
                applicantState: "NY",
                applicantZipCode: "00000",
                livingSituation: "OWN_HOME",
                householdSize: 1,
                reasonForAdoption: probe.label,
                // Whatever this says is flattened in step 2; the backfill is
                // what has to put the right value back.
                source: "SELF",
                history: {
                  create: {
                    status: "PENDING",
                    statusChangeReason: probe.reason,
                    changedById: submitterId,
                  },
                },
              },
              select: { id: true },
            });
            probeIds.set(probe.label, application.id);

            if (probe.orphaned) {
              await tx.applicationStatusHistory.updateMany({
                where: { applicationId: application.id },
                data: { changedById: null },
              });
            }
          }

          // 2. Simulate the pre-migration state on real data: every row sits on
          //    the temporary DEFAULT the column arrives with.
          resetCount = await tx.$executeRawUnsafe(
            `UPDATE "adoption_applications" SET "source" = 'SELF'`,
          );

          // 3. Run the migration's own backfill text, verbatim.
          updateCount = await tx.$executeRawUnsafe(updateStatement);

          // 4. Read the rows back and evaluate inside the same transaction.
          rows = await tx.$queryRawUnsafe<SubmissionRow[]>(SUBMISSION_ROWS_SQL);

          // 5. Never persist any of this.
          throw new RollbackSignal("verification complete — forcing ROLLBACK");
        },
        { timeout: 30_000 },
      );
    } catch (err) {
      if (!(err instanceof RollbackSignal)) throw err;
    }

    if (rows === null) {
      throw new Error("transaction body did not run to completion");
    }
    const submissions: SubmissionRow[] = rows;
    const byId = new Map(submissions.map((r) => [r.applicationId, r]));

    const mismatches = submissions.filter((r) => r.source !== expectedSource(r));
    const staffCount = submissions.filter((r) => r.source === "STAFF").length;

    console.log("── Backfill result (inside the rolled-back transaction) ──");
    console.log(`applications reset to SELF:         ${resetCount}`);
    console.log(`applications with a history row:    ${submissions.length}`);
    console.log(`rows touched by the backfill:       ${updateCount}`);
    console.log(`classified STAFF:                   ${staffCount}`);
    console.log(
      `classified SELF:                    ${submissions.length - staffCount}`,
    );
    console.log(
      `disagreements with the expectation: ${mismatches.length}`,
    );
    for (const m of mismatches.slice(0, 10)) {
      console.log(
        `   ${m.applicationId}: got ${m.source}, expected ${expectedSource(m)} (submitter ${m.submitterId ?? "NULL"}, reason ${JSON.stringify(m.reason)})`,
      );
    }
    console.log("\n── Probes ──");
    const probeProblems: string[] = [];
    for (const probe of PROBES) {
      const id = probeIds.get(probe.label);
      const row = id ? byId.get(id) : undefined;
      const got = row?.source ?? "(missing)";
      console.log(
        `   ${got === probe.expected ? "ok  " : "FAIL"} ${probe.label} → ${got} (expected ${probe.expected})`,
      );
      if (got !== probe.expected) {
        probeProblems.push(
          `probe "${probe.label}" classified ${got}, expected ${probe.expected}`,
        );
      }
    }
    console.log("─────────────────────────────────────────────────────────\n");

    // Assertions ----------------------------------------------------------------
    const problems: string[] = [...probeProblems];
    if (resetCount !== before.length + PROBES.length) {
      problems.push(
        `reset touched ${resetCount} rows, expected ${before.length + PROBES.length}`,
      );
    }
    if (mismatches.length > 0) {
      problems.push(
        `${mismatches.length} application(s) classified against the expectation`,
      );
    }

    // DB-unchanged check (outside the transaction) -----------------------------
    const after = await snapshot(prisma);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      problems.push(
        "adoption_applications source values changed after rollback",
      );
    }
    const probeRowsLeft = await prisma.adoptionApplication.count({
      where: { id: { in: [...probeIds.values()] } },
    });
    if (probeRowsLeft > 0) {
      problems.push(`${probeRowsLeft} probe application(s) survived the rollback`);
    }

    if (problems.length > 0) {
      console.error("FAILED:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      "PASSED — every application is classified by its submitter, an orphaned staff submission falls back to the reason string, and the dev database is unchanged.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("verify-application-source-backfill failed:", e);
  process.exit(1);
});
