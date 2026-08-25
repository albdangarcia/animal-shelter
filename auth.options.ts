import { prismaAdapter } from "better-auth/adapters/prisma";
import type { BetterAuthOptions, GenericEndpointContext, User } from "better-auth";
import prisma from "@/app/lib/prisma";

type ExtendedPrismaClient = typeof prisma;

// on user creation, link to an existing Person by exact email match only
// if the provider marked the email verified AND that Person has no user yet;
// otherwise create a new Person. Write an audit entry on every auto-link.
// Never match on phone or name.
//
// "Provider verified" covers two distinct callers of this hook:
//  - OAuth (GitHub): `user.emailVerified` already carries the provider's own
//    verified flag (better-auth's github provider maps it straight off
//    GitHub's per-email `verified` field) — trust it directly.
//  - Credential sign-up (email/password): `/sign-up/email` hardcodes
//    `emailVerified: false` unconditionally, so it never signals verification
//    itself. But `disableSignUp: true` on the app instance means
//    `/sign-up/email` can never reach this hook there — the only caller that
//    can ever hit this path is the seed's instance, which is trusted
//    by construction, not by anything the request itself claims.
function makeLinkOrCreatePerson(db: ExtendedPrismaClient) {
  return async function linkOrCreatePerson(
    user: User & Record<string, unknown>,
    context: GenericEndpointContext | null,
  ) {
    const email = user.email;
    const isCredentialSignUp = context?.path === "/sign-up/email";
    const isProviderVerified = isCredentialSignUp || user.emailVerified === true;

    if (isProviderVerified) {
      const existing = await db.person.findUnique({
        where: { email },
        include: { user: { select: { id: true } } },
      });

      if (existing && !existing.user) {
        await db.personNote.create({
          data: {
            personId: existing.id,
            content: `Auto-linked on account creation: provider-verified email (${email}) matched an existing Person with no user account.`,
          },
        });
        return { data: { personId: existing.id, emailVerified: true } };
      }
    }

    const person = await db.person.create({
      data: { name: user.name, email },
    });
    return {
      data: isProviderVerified
        ? { personId: person.id, emailVerified: true }
        : { personId: person.id },
    };
  };
}

// Shared config, no plugins, client injected — mounted by auth.ts (the app,
// pooled client) and prisma/seed.ts (the seed, direct client).
export const authOptions = (db: ExtendedPrismaClient) =>
  ({
    database: prismaAdapter(db, { provider: "postgresql" }),
    baseURL: {
      allowedHosts: process.env.BETTER_AUTH_ALLOWED_HOSTS?.split(",") ?? [],
      fallback: process.env.BETTER_AUTH_URL,
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
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
          before: makeLinkOrCreatePerson(db),
        },
      },
    },
  }) satisfies BetterAuthOptions;
