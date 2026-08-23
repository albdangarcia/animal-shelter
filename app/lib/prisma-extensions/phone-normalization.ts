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
// are none today; audit with `person:\s*\{\s*(create|update|upsert)`.
import { Prisma } from "@/prisma/generated/client";
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
export function derivePhoneNormalized(data: unknown): void {
  if (!data || typeof data !== "object") return;

  // createMany / createManyAndReturn take an array.
  if (Array.isArray(data)) {
    for (const row of data) derivePhoneNormalized(row);
    return;
  }

  // Absence is not the same as null. Writing unconditionally would clear the
  // column on every unrelated edit — a name-only update, or the backfill,
  // which writes phoneNormalized with no phone in the payload.
  if (!("phone" in data)) return;

  const row = data as Record<string, unknown>;
  row.phoneNormalized = normalizePhone(unwrapPhone(row.phone));
}

export const phoneNormalizationExtension = Prisma.defineExtension({
  name: "phone-normalization",
  query: {
    person: {
      create({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      createMany({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      createManyAndReturn({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      update({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      updateMany({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      updateManyAndReturn({ args, query }) {
        derivePhoneNormalized(args.data);
        return query(args);
      },
      // upsert carries two independent payloads.
      upsert({ args, query }) {
        derivePhoneNormalized(args.create);
        derivePhoneNormalized(args.update);
        return query(args);
      },
    },
  },
});
