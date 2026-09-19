// Lowercases Person.email and User.email on every write, so the case-sensitive
// unique index behaves like the case-insensitive comparison every reader in
// the app already assumes. Without it, staff typing `Jane@Example.com` and a
// provider reporting `jane@example.com` never match, and case-variant
// duplicates of one human can coexist.
//
// Same registration rule as the phone extension: prisma/seed.ts builds its own
// PrismaClient and would not inherit one applied only to the singleton. The
// invariant to hold going forward is `rg -n "new PrismaClient"`.
//
// Does NOT cover nested writes — `foo.create({ data: { applicant: { create:
// { email } } } })` bypasses query extensions entirely (prisma#24525). There
// are none today. Audit multiline (`rg -U`): a nested write is nearly always
// formatted across lines, which a line-based search can never match, and it
// can arrive through any relation that reaches Person or User, not only
// `person`. Derive the keys from the schema so the list cannot go stale:
//   keys=$(rg --no-filename -o '^\s+(\w+)\s+(Person|User)\??\s+@relation' -r '$1' prisma/schema.prisma | sort -u | paste -sd'|' -)
//   rg -U -n "\b($keys)\s*:\s*\{\s*(create|createMany|update|upsert|connectOrCreate)\s*:" app prisma/*.ts scripts --glob '!app/lib/prisma-extensions/*'
//
// Writes only. A `where: { email }` is passed through untouched, so a caller
// looking a row up by a mixed-case literal must lowercase it itself.
import { Prisma } from "@/prisma/generated/client";

// Lowercases a scalar write in either shape it can arrive in: flat
// (`email: "..."`) or wrapped in an update-operations object
// (`email: { set: "..." }`). Anything else — null, undefined, or a value the
// client will reject anyway — is returned as-is for Prisma to handle.
function lowercaseEmailValue(value: unknown): unknown {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "set" in value) {
    const wrapper = value as { set: unknown };
    return { ...wrapper, set: lowercaseEmailValue(wrapper.set) };
  }
  return value;
}

// Exported for unit testing: every arg shape can be checked without a database.
// Mutates in place, which is safe — the `args` handed to a query extension is
// already a deep clone of the caller's object, so this cannot leak back out.
export function lowercaseEmail(data: unknown): void {
  if (!data || typeof data !== "object") return;

  // createMany / createManyAndReturn take an array.
  if (Array.isArray(data)) {
    for (const row of data) lowercaseEmail(row);
    return;
  }

  // Absence is not the same as null. Rewriting unconditionally would touch the
  // column on every unrelated edit — a name-only update, for one.
  if (!("email" in data)) return;

  const row = data as Record<string, unknown>;
  row.email = lowercaseEmailValue(row.email);
}

type Query = (args: never) => Promise<unknown>;
type WriteArgs = { args: { data: unknown }; query: Query };

// One hook set for both models: the column, the rule and the write shapes are
// identical, and a divergence between Person and User is exactly the bug.
const lowercaseOnWrite = {
  create({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  createMany({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  createManyAndReturn({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  update({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  updateMany({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  updateManyAndReturn({ args, query }: WriteArgs) {
    lowercaseEmail(args.data);
    return query(args as never);
  },
  // upsert carries two independent payloads.
  upsert({
    args,
    query,
  }: {
    args: { create: unknown; update: unknown };
    query: Query;
  }) {
    lowercaseEmail(args.create);
    lowercaseEmail(args.update);
    return query(args as never);
  },
};

export const emailNormalizationExtension = Prisma.defineExtension({
  name: "email-normalization",
  query: {
    person: lowercaseOnWrite,
    user: lowercaseOnWrite,
  },
});
