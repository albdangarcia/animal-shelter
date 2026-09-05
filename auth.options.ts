import { prismaAdapter } from "better-auth/adapters/prisma";
import type { BetterAuthOptions, User } from "better-auth";
import prisma from "@/app/lib/prisma";

type ExtendedPrismaClient = typeof prisma;

// on user creation, link to an existing Person by exact email match only
// if the email is provider-verified AND that Person has no user yet;
// otherwise create a new Person. Write an audit entry on every auto-link.
// Never match on phone or name.
//
// Trust is a property of which instance constructed this hook, not of
// anything the request claims. `user.emailVerified === true` covers the real
// provider signal (OAuth, e.g. GitHub/Google — better-auth's social providers
// map their own verified-email flag straight onto it). `trustProvidedEmails`
// covers the other case: the app instance always constructs this hook with
// it `false` (the default) — it never trusts a request on its own say-so.
// The seed instance passes `true` because the seed is trusted by
// construction: every Person/User pair it creates is synthetic data it wrote
// itself moments earlier, not something a client asserted.
function makeLinkOrCreatePerson(db: ExtendedPrismaClient, trustProvidedEmails: boolean) {
  return async function linkOrCreatePerson(
    user: User & Record<string, unknown>,
  ) {
    const email = user.email;
    const isProviderVerified =
      user.emailVerified === true || trustProvidedEmails === true;

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
export const authOptions = (
  db: ExtendedPrismaClient,
  opts?: { trustProvidedEmails?: boolean },
) =>
  ({
    database: prismaAdapter(db, { provider: "postgresql" }),
    baseURL: {
      allowedHosts: process.env.BETTER_AUTH_ALLOWED_HOSTS?.split(",") ?? [],
      fallback: process.env.BETTER_AUTH_URL,
    },
    emailAndPassword: {
      // powers credential sign-in for seeded users. There is no signup form
      // in this repo and disableSignUp (auth.ts) blocks registration on the
      // app instance, but sign-in itself is untouched by that flag — don't
      // turn this off, it would lock out every seeded user.
      enabled: true,
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
          before: makeLinkOrCreatePerson(db, opts?.trustProvidedEmails ?? false),
        },
      },
    },
  }) satisfies BetterAuthOptions;
