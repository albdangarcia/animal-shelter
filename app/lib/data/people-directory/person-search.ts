// Kept free of the Prisma client import so pure modules (and their unit
// tests) can build person filters without a database connection.
import { Role } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { normalizePhoneQuery } from "../../utils/phone";

// Walk-in contacts with no account (user: null), and any registered account
// except ADMIN. Staff/volunteers are intentionally included since they may
// appear as finders/surrenderers via Intake. Shared by every non-admin person
// lookup: the directory list, the picker search, the duplicate check, and
// global search.
export const nonAdminPersonFilter: Prisma.PersonWhereInput = {
  OR: [{ user: null }, { user: { role: { not: Role.ADMIN } } }],
};

// Shared by the directory list, the picker search, and global search.
// Matched against name/email/phone.
export const personSearchWhereClause = (query: string): Prisma.PersonWhereInput => {
  // Only add a phoneNormalized match when the query actually looks like a
  // phone number: no letters (an email or name with a stray digit — e.g.
  // "surrenderer1@example.com" — is not a phone search) and at least 4 digits.
  // A 1-3 digit `contains` matches nearly every stored number and would swamp
  // the name/email conditions; 4 is the floor so "last four digits" lookups
  // still work.
  const digitsOnly = /^[\d\s()+.-]+$/.test(query.trim())
    ? normalizePhoneQuery(query)
    : "";
  const digitsQuery = digitsOnly.length >= 4 ? digitsOnly : "";

  return {
    AND: [
      nonAdminPersonFilter,
      {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          ...(digitsQuery
            ? [{ phoneNormalized: { contains: digitsQuery } }]
            : []),
        ],
      },
    ],
  };
};
