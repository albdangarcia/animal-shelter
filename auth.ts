import NextAuth, { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "./app/lib/prisma";
import { z } from 'zod';
import { type DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import bcrypt from 'bcrypt';
import { User } from "@prisma/client";
import { authProviderConfigList } from "./auth.config";

// get user from db
async function getUser(email: string): Promise<User | undefined | null> {
  try {
    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}

// declare custom user properties
declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface User {
    role: string;
  }

  interface Session {
    user: {
      role: string;
      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession["user"];
  }
}
declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: string;
  }
}
declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `auth`, when using JWT sessions */
  interface JWT {
    role: string;
  }
}

// credentials setup for admin email/password login
const credentialsConfig = Credentials({
  // The credentials object is used to define the fields used to log in
  credentials: {
    email: {
      label: 'Email',
      type: 'email',
    },
    password: {
      label: 'Password',
      type: 'password',
    },
  },
  // The authorize callback validates credentials
  authorize: async (credentials) => {
    // Validate the credentials for the user
    const parsedCredentials = z
      .object({ email: z.string().email(), password: z.string().min(6) })
      .safeParse(credentials);

    // If the credentials are valid, return the user object
    if (parsedCredentials.success) {
      const { email, password } = parsedCredentials.data;
    
      const user = await getUser(email);
      
      // If user does not exist or password is missing, throw an error
      if (!user || !user.password) return null;
      
      const passwordsMatch = await bcrypt.compare(password, user.password);

      // If the password is correct, return the user object
      if (passwordsMatch) return user;
    }

    console.log('Invalid credentials');
    return null;
  },
})

// auth config
export const authConfig = {
  adapter: PrismaAdapter(prisma),
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      session.user.role = token.role;
      return session;
    },
  },
  session: { 
    strategy: "jwt",
  },
  providers: [...authProviderConfigList.providers, credentialsConfig ],
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);