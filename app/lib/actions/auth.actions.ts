"use server";

import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/auth";
import { DEACTIVATED_ACCOUNT_CODE } from "@/auth.options";
import { safeInternalPath } from "../utils/safe-redirect";
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
    await auth.api.signInEmail({ body: { email, password } });
  } catch (error) {
    if (
      error instanceof APIError &&
      error.body?.code === "INVALID_EMAIL_OR_PASSWORD"
    ) {
      return { ok: false, message: "Invalid email or password." };
    }
    // Only reached with the right password, so naming the cause discloses
    // nothing to someone who does not already hold the account.
    if (
      error instanceof APIError &&
      error.body?.code === DEACTIVATED_ACCOUNT_CODE
    ) {
      return { ok: false, message: error.body.message ?? "Account deactivated." };
    }
    throw error;
  }

  redirect(safeInternalPath(callbackUrl, "/dashboard"));
};
