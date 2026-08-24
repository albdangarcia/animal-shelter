import { prismaAdapter } from "better-auth/adapters/prisma";
import type { BetterAuthOptions, GenericEndpointContext, User } from "better-auth";
import prisma from "@/app/lib/prisma";

type ExtendedPrismaClient = typeof prisma;

// on user creation, link to an existing Person by exact email match only if
// the provider marked the email verified AND that Person has no user yet;
// otherwise create a new Person. Write an audit entry on every auto-link.
// Never match on phone or name.
async function linkOrCreatePerson(
  user: User & Record<string, unknown>,
  _context: GenericEndpointContext | null,
) {
  void user;
  return;
}

// Shared config, no plugins, client injected — mounted by auth.ts (the app,
// pooled client) and prisma/seed.ts (the seed, direct client).
export const authOptions = (db: ExtendedPrismaClient) =>
  ({
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      github: {
        clientId: process.env.AUTH_GITHUB_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!,
      },
    },
    user: {
      additionalFields: {
        personId: {
          type: "string",
          input: false,
        },
        role: {
          type: ["ADMIN", "STAFF", "USER", "VOLUNTEER"],
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: linkOrCreatePerson,
        },
      },
    },
  }) satisfies BetterAuthOptions;
