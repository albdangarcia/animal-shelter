"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);

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
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={
              form.formState.errors.email ? "email-error" : undefined
            }
            className="block w-full appearance-none rounded-full border border-input bg-background px-4 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:border-ring focus:ring-ring focus:outline-none sm:text-sm"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p
              id="email-error"
              role="alert"
              className="mt-1 text-sm text-destructive"
            >
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
        <div className="relative mt-1">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            aria-describedby={
              form.formState.errors.password ? "password-error" : undefined
            }
            className="block w-full appearance-none rounded-full border border-input bg-background px-4 py-2 pr-10 text-foreground placeholder-muted-foreground shadow-sm focus:border-ring focus:ring-ring focus:outline-none sm:text-sm"
            {...form.register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {form.formState.errors.password && (
            <p
              id="password-error"
              role="alert"
              className="mt-1 text-sm text-destructive"
            >
              {form.formState.errors.password.message}
            </p>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full justify-center rounded-full border border-transparent bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-organic-accent-600 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:outline-none disabled:opacity-50"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};
