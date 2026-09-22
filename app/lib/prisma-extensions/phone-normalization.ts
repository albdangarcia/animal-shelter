// Derives Person.phoneNormalized from Person.phone on every write, so no call
// site has to remember. Replaces five inline normalizePhone() calls.
//
// Defined standalone rather than inline in app/lib/prisma.ts because
// prisma/seed.ts and prisma/backfill-phone-normalized.ts each instantiate
// their own PrismaClient and would not inherit an extension applied only to
// the singleton. Apply this in all three places. The invariant to hold going
// forward is `rg -n "new PrismaClient"`.
//
// Does NOT cover nested writes — `foo.create({ data: { applicant: { create:
// { phone } } } })` bypasses query extensions entirely (prisma#24525). There
// are none today. Audit multiline (`rg -U`): a nested write is nearly always
// formatted across lines, which a line-based search can never match, and it
// can arrive through any relation that reaches Person, not only `person`.
// Derive the keys from the schema so the list cannot go stale:
//   keys=$(rg --no-filename -o '^\s+(\w+)\s+(Person|User)\??\s+@relation' -r '$1' prisma/schema.prisma | sort -u | paste -sd'|' -)
//   rg -U -n "\b($keys)\s*:\s*\{\s*(create|createMany|update|upsert|connectOrCreate)\s*:" app prisma/*.ts scripts --glob '!app/lib/prisma-extensions/*'
import { Prisma } from "@/prisma/generated/client";
import type { CountryCode } from "libphonenumber-js";
import { normalizePhone } from "@/app/lib/utils/phone";

// A scalar update arrives either flat (`phone: "..."`) or wrapped in an
// update-operations object (`phone: { set: "..." }`). Both are the same write;
// reading data.phone directly gets the wrapper on the second form.
function unwrapPhone(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "set" in value) {
    return unwrapPhone((value as { set: unknown }).set);
  }
  return null;
}

// Exported for unit testing: every arg shape can be checked without a database.
// Mutates in place, which is safe — the `args` handed to a query extension is
// already a deep clone of the caller's object, so this cannot leak back out.
export function derivePhoneNormalized(data: unknown, country: CountryCode = "US"): void {
  if (!data || typeof data !== "object") return;

  // createMany / createManyAndReturn take an array.
  if (Array.isArray(data)) {
    for (const row of data) derivePhoneNormalized(row, country);
    return;
  }

  // Absence is not the same as null. Writing unconditionally would clear the
  // column on every unrelated edit — a name-only update, or the backfill,
  // which writes phoneNormalized with no phone in the payload.
  if (!("phone" in data)) return;

  const row = data as Record<string, unknown>;
  row.phoneNormalized = normalizePhone(unwrapPhone(row.phone), country);
}

export const phoneNormalizationExtension = (readCountry: () => Promise<CountryCode>) => Prisma.defineExtension({
  name: "phone-normalization",
  query: {
    person: {
      async create({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      async createMany({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      async createManyAndReturn({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      async update({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      async updateMany({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      async updateManyAndReturn({ args, query }) {
        derivePhoneNormalized(args.data, await readCountry());
        return query(args);
      },
      // upsert carries two independent payloads.
      async upsert({ args, query }) {
        const country = await readCountry();
        derivePhoneNormalized(args.create, country);
        derivePhoneNormalized(args.update, country);
        return query(args);
      },
    },
  },
});
