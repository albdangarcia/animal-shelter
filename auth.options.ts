import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth";
import type { BetterAuthOptions, User } from "better-auth";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";

type ExtendedPrismaClient = typeof prisma;

// The code better-auth reports to a client when a deactivated account tries to
// start a session, and the sentence that goes with it.
//
// Both are exported because the refusal is thrown inside a database hook, and
// the two routes that reach that hook surface it completely differently. A
// credentials sign-in throws back into `signInWithCredentials`, which reads
// `error.body.message` and hands it to the form. An OAuth sign-in is a
// redirect: better-auth catches the same error in its callback route and
// bounces the browser to the flow's `errorCallbackURL` with `?error=<code>` on
// it, keeping nothing but the code. So the sign-in page has to be able to look
// the wording up from the code alone, and it must be the same wording either
// route produces.
export const DEACTIVATED_ACCOUNT_CODE = "ACCOUNT_DEACTIVATED";
export const DEACTIVATED_ACCOUNT_MESSAGE =
  "This account has been deactivated. Please contact the shelter.";

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
    // Deliberately lowercased here as well as upstream. better-auth already
    // lowercases the email before this hook runs (createUser / createOAuthUser
    // in its internal adapter), but the Person.email extension only normalizes
    // writes and passes `where` through untouched, so the lookup below is
    // case-insensitive only if its input is already lowercase. Depending on an
    // internal of a pinned dependency for that fails silently — the link just
    // stops happening — so this is defense in depth, not redundancy.
    const email = user.email.toLowerCase();
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

    // This create can hand `Person.email @unique` an address a Person already
    // holds, by either route into it: the lookup above matched but the link
    // was skipped because that Person already has an account, or the lookup
    // never ran at all because the email is not provider-verified. It happens
    // when a shelter record carries the wrong email — staff mistype one
    // person's address onto another's row — and the person whose address it
    // really is tries to sign up.
    //
    // Uncaught, the P2002 leaves better-auth with a 500 and that person with no
    // way to register at all. A named 409 at least says what went wrong. It is
    // not a repair either — the two records still have to be sorted out by
    // someone who can see both, and inventing a second Person here would only
    // hide the collision.
    //
    // What the 409 is allowed to say depends on which route reached it. A
    // provider-verified caller owns the address, so naming it discloses
    // nothing they did not already know, and they need it to tell the shelter
    // which record to look at. An unverified caller has proven nothing: for
    // them a message that distinguishes "this address is on a record" from any
    // other sign-up failure is an enumeration oracle, and for a shelter the
    // mere presence of a record says the person dealt with the organisation.
    // They get one generic failure with nothing in it to probe. The code is
    // the same on both routes — it is the app's own handle on this case, not
    // something the caller is told.
    try {
      const person = await db.person.create({
        data: { name: user.name, email },
      });
      return {
        data: isProviderVerified
          ? { personId: person.id, emailVerified: true }
          : { personId: person.id },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new APIError("CONFLICT", {
          code: "EMAIL_ON_ANOTHER_SHELTER_RECORD",
          message: isProviderVerified
            ? `This email address (${email}) is already recorded on a shelter record. Please contact the shelter so it can be corrected.`
            : "We could not complete your sign-up. Please contact the shelter.",
        });
      }
      throw error;
    }
  };
}

// A deactivated account gets no new session. Deactivation is enforced at three
// points and this is the one that stops the sign-in itself: without it the
// credentials or OAuth flow "succeeds", the user lands in a logged-out state
// because `getCachedSession` refuses the session it just made, signs in again,
// and loops. The other two are the session revocation that runs when the
// account is deactivated, and the check in `getCachedSession`.
//
// Same shape as better-auth's admin plugin ban check, minus its expiry: a
// deactivation ends when an admin reactivates the account, not on a timer. The
// user is read through the injected client rather than through better-auth's
// internal adapter so this hook can be driven directly in a test, the way the
// sign-up hook is, with no better-auth context to construct.
//
// The code and message are safe to show: for credentials this runs after the
// password has been verified, and for OAuth after the provider has, so neither
// discloses anything to someone who does not already hold the account.
function refuseDeactivatedAccount(db: ExtendedPrismaClient) {
  return async function refuse(session: { userId: string }) {
    const account = await db.user.findUnique({
      where: { id: session.userId },
      select: { deactivatedAt: true },
    });
    if (account?.deactivatedAt) {
      throw new APIError("FORBIDDEN", {
        code: DEACTIVATED_ACCOUNT_CODE,
        message: DEACTIVATED_ACCOUNT_MESSAGE,
      });
    }
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
        // On the session's user so `getCachedSession` can refuse a
        // deactivated account without a query of its own per request.
        deactivatedAt: {
          type: "date",
          required: false,
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
      session: {
        create: {
          before: refuseDeactivatedAccount(db),
        },
      },
    },
  }) satisfies BetterAuthOptions;
