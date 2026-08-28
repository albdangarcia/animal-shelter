import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth.options";

export const auth = betterAuth({
  ...authOptions(prisma),
  emailAndPassword: {
    enabled: true,
    // disables the /sign-up/email registration endpoint only.
    // Credential sign-in is unaffected. This looks like a mistake — it
    // isn't. There is no signup form in this repo; credential users exist
    // only because the seed makes them. With public registration off, GitHub
    // is the only self-serve path, and GitHub supplies verified emails
    disableSignUp: true,
  },
  // Must be last: without it, sign-in via a server action creates the
  // session row but never sets the cookie in the browser.
  plugins: [nextCookies()],
});
