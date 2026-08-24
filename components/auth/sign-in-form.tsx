"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { signInWithCredentials } from "@/app/lib/actions/auth.actions";
import {
  SignInFormSchema,
  type SignInFormInput,
} from "@/app/lib/zod-schemas/common.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

interface SignInFormProps {
  callbackUrl: string;
}

export const SignInForm = ({ callbackUrl }: SignInFormProps) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<SignInFormInput>({
    resolver: standardSchemaResolver(SignInFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: SignInFormInput) => {
    startSubmitTransition(async () => {
      const result = await signInWithCredentials(callbackUrl, values);

      if (result.ok) {
        toast.success(result.message);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
            type="email"
            autoComplete="email"
            className="block w-full appearance-none rounded-md border border-input bg-background text-foreground px-3 py-2 placeholder-muted-foreground shadow focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-sm text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
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
            type="password"
            autoComplete="current-password"
            className="block w-full appearance-none rounded-md border border-input bg-background text-foreground px-3 py-2 placeholder-muted-foreground shadow focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-sm text-destructive">
              {form.formState.errors.password.message}
            </p>
          )}
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
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};
