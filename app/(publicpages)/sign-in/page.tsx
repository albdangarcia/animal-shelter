import { redirect } from "next/navigation";
import { IconPaw } from "@tabler/icons-react";
import { auth } from "@/auth";
import { getCachedSession } from "@/app/lib/auth/session";
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

interface Props {
  searchParams: SearchParamsType;
}

const SignInPage = async ({ searchParams }: Props) => {
  const { callbackUrl } = await searchParams;
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
                      body: { provider: provider.id, callbackURL: redirectTo },
                    });
                    if (url) redirect(url);
                  }}
                >
                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-transparent px-4 text-[14px] transition-colors hover:bg-accent"
                  >
                    {provider.id === "google" ? (
                      // Deliberate literal white: Google's mark is multi-colour
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
