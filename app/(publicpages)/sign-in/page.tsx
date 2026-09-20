import { redirect } from "next/navigation";
import { IconPaw } from "@tabler/icons-react";
import { TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import {
  DEACTIVATED_ACCOUNT_CODE,
  DEACTIVATED_ACCOUNT_MESSAGE,
} from "@/auth.options";
import { getCachedSession } from "@/app/lib/auth/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitHubIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SearchParamsType } from "@/app/lib/types";
import { safeInternalPath } from "@/app/lib/utils/safe-redirect";

/**
 * A door, not a room. No accent band and no decorative circles — the page sits
 * on --background and spends none of the boldness the homepage hero uses.
 */

const providerMap = [
  { id: "github", name: "GitHub", label: "Sign in with GitHub" },
  { id: "google", name: "Google", label: "Sign in with Google" },
] as const;

const providerIcons = {
  github: GitHubIcon,
  google: GoogleIcon,
} as const;

/**
 * Where a refused social sign-in comes back to. Without it better-auth sends
 * the browser to its own built-in `/api/auth/error` page, which is outside this
 * app entirely — no nav, no styling, and a button that leads off to
 * better-auth's own site. A refusal belongs back at the door the person
 * knocked on, with the destination they were heading for still attached so the
 * retry goes where the first attempt would have.
 */
const signInPathFor = (destination: string) =>
  `/sign-in?callbackUrl=${encodeURIComponent(destination)}`;

/**
 * What the card says when a social sign-in came back refused. Credentials
 * sign-in never reaches this: it gets the same sentence from the thrown error,
 * through the form's toast.
 *
 * Only this app's own refusal codes are spelled out. Everything else falls to
 * the generic line deliberately — better-auth's own `OAUTH_CALLBACK_ERROR_CODES`
 * describe machinery the person cannot act on, and the linking hook's
 * `EMAIL_ON_ANOTHER_SHELTER_RECORD` says more or less depending on whether the
 * provider vouched for the address. The code alone does not carry which, and
 * the guarded half is the only one safe to show without knowing: to an
 * unverified caller, "that address is on a record" is an oracle for whether
 * someone has dealt with the shelter.
 *
 * better-auth also puts an `error_description` on the redirect, and this
 * ignores it. Anyone can send somebody a `/sign-in?error=x&error_description=…`
 * link, so reflecting it would render text of a stranger's choosing — a number
 * to ring, an address to write to — inside this app's own sign-in card.
 */
const signInErrorMessage = (code: string) =>
  code === DEACTIVATED_ACCOUNT_CODE
    ? DEACTIVATED_ACCOUNT_MESSAGE
    : "Please try again, or contact the shelter if it keeps happening.";

interface Props {
  searchParams: SearchParamsType;
}

const SignInPage = async ({ searchParams }: Props) => {
  const { callbackUrl, error } = await searchParams;
  // Guards the auth.api.signInSocial call below, which nothing downstream
  // validates. auth.actions.ts guards its own argument separately — it's a
  // public POST endpoint — so this looks redundant for the credentials path.
  // It isn't: remove this and the social path goes unchecked.
  const redirectTo = safeInternalPath(callbackUrl, "/");

  const session = await getCachedSession();
  if (session) {
    return redirect(redirectTo);
  }

  return (
    // min-h-full centres the card in whatever the nav and footer leave behind:
    // <main> is a grown flex item, so its height is definite and the
    // percentage resolves. The padding carries the layout if it ever doesn't.
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-14 sm:px-8 sm:py-20">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center">
          {/* The nav's brand mark repeated. Decorative — the nav's own mark,
              directly above, is the link home. */}
          <span
            aria-hidden="true"
            className="grid size-[38px] place-items-center rounded-full bg-primary"
          >
            <IconPaw className="size-5 text-background" />
          </span>
          <h1 className="mt-5 font-display text-[32px]">Sign in</h1>
        </div>

        <div className="mt-8 rounded-[32px] bg-card p-8 shadow-organic-md">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>We couldn&apos;t sign you in</AlertTitle>
              <AlertDescription>{signInErrorMessage(error)}</AlertDescription>
            </Alert>
          )}
          <SignInForm callbackUrl={redirectTo} />

          {/* Hairline with "or" plated over it in --card, rather than a gap */}
          <div className="relative my-6 flex justify-center">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-px bg-border"
            />
            <span className="relative bg-card px-3 text-[12px] text-muted-foreground">
              or
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {providerMap.map((provider) => {
              const Icon = providerIcons[provider.id];
              return (
                <form
                  key={provider.id}
                  action={async () => {
                    "use server";
                    const { url } = await auth.api.signInSocial({
                      body: {
                        provider: provider.id,
                        callbackURL: redirectTo,
                        errorCallbackURL: signInPathFor(redirectTo),
                      },
                    });
                    if (url) redirect(url);
                  }}
                >
                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-transparent px-4 text-[14px] transition-colors hover:bg-accent"
                  >
                    {provider.id === "google" ? (
                      // Deliberate literal white: Google's mark is multi-color
                      // and needs a light plate to stay legible on any surface
                      // the button lands on.
                      <span className="flex items-center justify-center rounded bg-white p-1">
                        <Icon aria-hidden="true" className="w-4 h-4" />
                      </span>
                    ) : (
                      <Icon aria-hidden="true" className="w-5 h-5" />
                    )}
                    <span>{provider.label}</span>
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
