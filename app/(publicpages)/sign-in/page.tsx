import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, providerMap, signIn } from "@/auth";
import { ProviderIcon } from "@/components/auth/provider-icon";
import { SearchParamsType } from "@/app/lib/types";
import clsx from "clsx";

const SIGNIN_ERROR_URL = "/error";

interface Props {
  searchParams: SearchParamsType;
}

const SignInPage = async ({ searchParams }: Props) => {
  const session = await auth();
  if (session) {
    return redirect("/");
  }

  const { callbackUrl } = await searchParams;

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
          {/* Email & Password Form */}
          <form
            className="space-y-6"
            action={async (formData) => {
              "use server";
              try {
                await signIn("credentials", formData);
              } catch (error) {
                if (error instanceof AuthError) {
                  return redirect(`${SIGNIN_ERROR_URL}?error=${error.type}`);
                }
                throw error;
              }
            }}
          >
            {/* hidden input to pass the callbackUrl */}
            <input type="hidden" name="redirectTo" value={callbackUrl ?? "/"} />

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full appearance-none rounded-md border border-input bg-background text-foreground px-3 py-2 placeholder-muted-foreground shadow focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full appearance-none rounded-md border border-input bg-background text-foreground px-3 py-2 placeholder-muted-foreground shadow focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-indigo-600 focus:ring-ring"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 block text-sm text-foreground"
                >
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a
                  href="#"
                  className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Forgot password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                Sign in
              </button>
            </div>
          </form>

          {/* Separator */}
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

          {/* Social Providers */}
          <div
            className={clsx(
              "mt-6 grid gap-3",
              providerMap.length > 2 ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {Object.values(providerMap).map((provider) => {
              return (
                <form
                  key={provider.id}
                  action={async () => {
                    "use server";
                    try {
                      await signIn(provider.id, {
                        redirectTo: callbackUrl ?? "/",
                      });
                    } catch (error) {
                      if (error instanceof AuthError) {
                        return redirect(
                          `${SIGNIN_ERROR_URL}?error=${error.type}`,
                        );
                      }
                      throw error;
                    }
                  }}
                >
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center py-2 px-4 border rounded-md shadow bg-card text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <span className="sr-only">
                      Sign in with {provider.name}
                    </span>
                    <ProviderIcon
                      providerId={provider.id}
                      providerName={provider.name}
                      className="w-5 h-5"
                    />
                    <span className="ml-2">{provider.name}</span>
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
