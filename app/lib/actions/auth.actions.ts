"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import {
  SignInFormSchema,
  type SignInFormInput,
} from "../zod-schemas/common.schemas";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type SignInResult = FormResult<SignInFormInput>;

export const signInWithCredentials = async (
  callbackUrl: string,
  values: SignInFormInput,
): Promise<SignInResult> => {
  const validatedFields = SignInFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Please check the form for errors.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<SignInFormInput>,
    };
  }

  const { email, password } = validatedFields.data;

  try {
    // On success this throws internally — next-auth's signIn() redirects by
    // itself when `redirect` isn't disabled — so the line after the try block
    // only ever runs on failure paths that don't throw AuthError, which don't
    // exist today but keep the function's return type honest.
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return { ok: false, message: "Invalid email or password." };
    }
    throw error;
  }

  return { ok: true, message: "Signed in successfully." };
};
