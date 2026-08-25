import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedSession } from "@/app/lib/auth/session";
import { ProviderIcon } from "@/components/auth/provider-icon";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SearchParamsType } from "@/app/lib/types";
import clsx from "clsx";

const providerMap = [{ id: "github", name: "GitHub" }] as const;

interface Props {
  searchParams: SearchParamsType;
}

const SignInPage = async ({ searchParams }: Props) => {
  const session = await getCachedSession();
  if (session) {
    return redirect("/");
  }

  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? "/";

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
          <div
            className={clsx(
              "mt-6 grid gap-3",
              providerMap.length > 2 ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {Object.values(providerMap).map((provider) => (
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
                  className="w-full inline-flex justify-center py-2 px-4 border rounded-md shadow bg-card text-sm font-medium text-foreground hover:bg-accent"
                >
                  <span className="sr-only">Sign in with {provider.name}</span>
                  <ProviderIcon
                    providerId={provider.id}
                    providerName={provider.name}
                    className="w-5 h-5"
                  />
                  <span className="ml-2">{provider.name}</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
