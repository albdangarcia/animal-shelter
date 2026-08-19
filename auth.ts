import NextAuth, { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/app/lib/prisma";
import { type DefaultSession } from "next-auth";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { authProviderConfigList } from "./auth.config";
import type { AdapterUser } from "@auth/core/adapters";
import type { UserModel } from "@/prisma/generated/models/User";
import type { Role } from "@/prisma/generated/enums";
import { SignInFormSchema } from "@/app/lib/zod-schemas/common.schemas";

// declare custom user properties
declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface User {
    role: Role;
    personId: string;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      personId: string;
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
    role: Role;
    personId: string;
  }
}
declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `auth`, when using JWT sessions */
  interface JWT {
    role: Role;
    personId: string;
  }
}

// get user from db
const getUser = async (email: string): Promise<UserModel | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    return user;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
};

const CustomPrismaAdapter = (p: typeof prisma) => {
  return {
    ...PrismaAdapter(p.$extends({})),
    createUser: async (data: Omit<AdapterUser, "id">) => {
      // Use a transaction to ensure both Person and User are created successfully
      const user = await p.$transaction(async (tx) => {
        // Create the Person record first
        const person = await tx.person.create({
          data: {
            name: data.name ?? "",
            email: data.email,
          },
        });

        // Create the User and connect it to the new Person
        const user = await tx.user.create({
          data: {
            email: data.email,
            image: data.image,
            emailVerified: data.emailVerified,
            person: {
              connect: {
                id: person.id,
              },
            },
          },
        });

        return user;
      });

      return {
        ...user,
        emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
      };
    },
  };
};

// credentials setup for admin email/password login
const credentialsConfig = Credentials({
  // The credentials object is used to define the fields used to log in
  credentials: {
    email: {
      label: "Email",
      type: "email",
    },
    password: {
      label: "Password",
      type: "password",
    },
  },
  // The authorize callback validates credentials
  authorize: async (credentials) => {
    // Validate the credentials for the user
    const parsedCredentials = SignInFormSchema.safeParse(credentials);

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
    return null;
  },
});

// auth config
export const authConfig = {
  ...authProviderConfigList,
  adapter: CustomPrismaAdapter(prisma),
  callbacks: {
    async jwt({ token, user: _user }) {
      // If the token already has the data, just return it.
      if (token.personId) {
        return token;
      }

      // This runs only on initial sign-in.
      if (token.sub) {
        // Fetch the user from the database to get their personId.
        const existingUser = await prisma.user.findUnique({
          where: { id: token.sub },
        });

        if (existingUser) {
          // Now that you have the personId, fetch the person.
          const person = await prisma.person.findUnique({
            where: { id: existingUser.personId }, // Use the ID from the user
            select: { name: true },
          });

          // Populate the token with all the necessary data.
          token.personId = existingUser.personId;
          token.role = existingUser.role;
          if (person) {
            token.name = person.name;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.personId = token.personId as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },

  providers: [...authProviderConfigList.providers, credentialsConfig],
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Re-export providerMap for convenience
export { providerMap } from "./auth.config";
