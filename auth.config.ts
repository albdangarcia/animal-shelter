import github from "next-auth/providers/github";
import { NextAuthConfig } from "next-auth";

export const authProviderConfigList = {
  providers: [
    github,
  ],
} satisfies NextAuthConfig;
