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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="block text-[12px] text-muted-foreground"
        >
          Email address
        </label>
        <div className="mt-1.5">
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={
              form.formState.errors.email ? "email-error" : undefined
            }
            className="block min-h-9 w-full appearance-none rounded-full border border-border bg-background px-3.5 text-[14px] text-foreground placeholder-muted-foreground transition-[color,border-color,box-shadow] outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p
              id="email-error"
              role="alert"
              className="mt-1.5 text-[12px] text-destructive"
            >
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-[12px] text-muted-foreground"
        >
          Password
        </label>
        <div className="mt-1.5">
          {/* The toggle is inset-y-0 against the input alone — with the error
              inside this box it would centre itself over both. */}
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={
                form.formState.errors.password ? "password-error" : undefined
              }
              className="block min-h-9 w-full appearance-none rounded-full border border-border bg-background px-3.5 pr-10 text-[14px] text-foreground placeholder-muted-foreground transition-[color,border-color,box-shadow] outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {form.formState.errors.password && (
            <p
              id="password-error"
              role="alert"
              className="mt-1.5 text-[12px] text-destructive"
            >
              {form.formState.errors.password.message}
            </p>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-[15px] text-primary-foreground transition-colors outline-none hover:bg-organic-accent-600 focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:opacity-50"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};
