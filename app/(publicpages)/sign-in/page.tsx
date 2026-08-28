import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedSession } from "@/app/lib/auth/session";
import { GitHubIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SearchParamsType } from "@/app/lib/types";
import { safeInternalPath } from "@/app/lib/utils/safe-redirect";

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
    <div className="flex flex-col items-center justify-center pt-8 pb-17 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <div className="flex justify-center">
            <span className="text-3xl font-semibold text-indigo-600 dark:text-indigo-400">
              Pet Adopt
            </span>
          </div>
          <h2 className="mt-6 text-center text-2xl font-medium text-foreground">
            Sign in to your account
          </h2>
        </div>
        <div className="bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <SignInForm callbackUrl={redirectTo} />
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3">
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
                    className="w-full inline-flex items-center justify-center py-2 px-4 border rounded-md shadow bg-card text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {provider.id === "google" ? (
                      <span className="flex items-center justify-center rounded bg-white p-1">
                        <Icon aria-hidden="true" className="w-4 h-4" />
                      </span>
                    ) : (
                      <Icon aria-hidden="true" className="w-5 h-5" />
                    )}
                    <span className="ml-2">{provider.label}</span>
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
