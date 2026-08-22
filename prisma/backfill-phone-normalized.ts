// Run via `npm run prisma:backfill-phone`. The npm script passes
// `-e .env` LAST: DATABASE_URL lives in .env, loaded by prisma.config.ts
// via `import "dotenv/config"`. This script runs standalone under tsx, not
// through the Prisma CLI, so it only gets what dotenv-cli supplies —
// copying seed.ts's connection code does NOT carry its env loading, since
// seed.ts is invoked via `prisma db seed`. .env goes last so .env.local
// keeps precedence.
//
// --force recomputes every row with a phone, ignoring the
// `phoneNormalized IS NULL` filter. That's for after a libphonenumber-js
// version bump changes normalization: stored derived values don't correct
// themselves.
import { PrismaClient, Prisma } from "@/prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrl } from "@/app/lib/db-url";
import { normalizePhone } from "@/app/lib/utils/phone";

interface BackfillOptions {
  dryRun: boolean;
  force: boolean;
  batchSize: number;
}

function parseArgs(args: string[]): BackfillOptions {
  let dryRun = false;
  let force = false;
  let batchSize = 500;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-d" || arg === "--dryRun") {
      dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg.startsWith("--batch-size=") || arg.startsWith("--batchSize=")) {
      const val = parseInt(arg.split("=")[1], 10);
      if (!isNaN(val) && val > 0) {
        batchSize = val;
      }
    } else if (arg === "--batch-size" || arg === "-b" || arg === "--batchSize") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        const val = parseInt(nextArg, 10);
        if (!isNaN(val) && val > 0) {
          batchSize = val;
          i++;
        }
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx prisma/backfill-phone-normalized.ts [options]

Options:
  --dry-run, -d        Compute and report without writing to the database
  --force, -f          Recompute all rows with non-null phone (ignores phoneNormalized IS NULL guard)
  --batch-size, -b <n> Number of records to process per batch (default: 500)
  --help, -h           Show this help message
`);
      process.exit(0);
    }
  }

  return { dryRun, force, batchSize };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { dryRun, force, batchSize } = options;

  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl("direct") });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Starting phone normalization backfill...");
    console.log(`Mode:       ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
    console.log(`Scope:      ${force ? "FORCE (all non-null phone rows)" : "UNNORMALIZED ONLY (phone IS NOT NULL AND phoneNormalized IS NULL)"}`);
    console.log(`Batch size: ${batchSize}`);

    const where: Prisma.PersonWhereInput = force
      ? { phone: { not: null } }
      : { phone: { not: null }, phoneNormalized: null };

    let cursor: string | undefined = undefined;
    let totalProcessed = 0;
    let normalizedCount = 0;
    let nullCount = 0;
    let updatedCount = 0;

    while (true) {
      const batch: Array<{
        id: string;
        phone: string | null;
        phoneNormalized: string | null;
      }> = await prisma.person.findMany({
        where,
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
        },
      });

      if (batch.length === 0) {
        break;
      }

      cursor = batch[batch.length - 1].id;
      totalProcessed += batch.length;

      const updates: { id: string; phoneNormalized: string | null }[] = [];

      for (const person of batch) {
        const normalized = normalizePhone(person.phone);

        if (normalized !== null) {
          normalizedCount++;
        } else {
          nullCount++;
        }

        if (!dryRun) {
          if (person.phoneNormalized !== normalized) {
            updates.push({ id: person.id, phoneNormalized: normalized });
          }
        }
      }

      if (!dryRun && updates.length > 0) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.person.update({
              where: { id: u.id },
              data: { phoneNormalized: u.phoneNormalized },
            }),
          ),
        );
        updatedCount += updates.length;
      }

      console.log(`Processed ${totalProcessed} rows...`);
    }

    console.log("\n--- Phone Normalization Backfill Complete ---");
    console.log(`Mode:                                    ${dryRun ? "DRY RUN (no database changes made)" : "LIVE"}`);
    console.log(`Scope:                                   ${force ? "All rows with phone (force mode)" : "Rows with phoneNormalized IS NULL"}`);
    console.log(`Total rows processed:                    ${totalProcessed}`);
    console.log(`Rows normalized:                         ${normalizedCount}`);
    console.log(`Rows where normalizePhone returned null: ${nullCount}`);
    if (!dryRun) {
      console.log(`Rows updated in database:                ${updatedCount}`);
    }
    console.log("---------------------------------------------\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("An error occurred during the backfill process:", e);
  process.exit(1);
});
