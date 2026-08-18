import github from "next-auth/providers/github";
import { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";

// Define providers array to make it reusable
export const providers: Provider[] = [github];

export const authProviderConfigList = {
  providers,
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig;

// Export providerMap for frontend use
export const providerMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider();
      return { id: providerData.id, name: providerData.name };
    } else {
      return { id: provider.id, name: provider.name };
    }
  })
  .filter((provider) => provider.id !== "credentials");