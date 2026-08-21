"use client";

import {
  createPerson,
  updateMyProfile,
  updatePerson,
  type DuplicateCandidate,
} from "@/app/lib/actions/person.actions";
import { useState, useTransition } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, type DefaultValues } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  PersonFormSchema,
  StaffPersonFormSchema,
  type PersonFormInput,
} from "@/app/lib/zod-schemas/people-directory.schemas";
import { US_STATES } from "@/app/lib/constants/us-states";
import Link from "next/link";
import { PersonFormPayload } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

export type PersonFormValues = PersonFormInput;

interface PersonFormProps {
  person?: PersonFormPayload;
  mode?: "staff" | "self";
  cancelHref?: string;
  returnTo?: string;
}

const buildDefaultValues = (
  person?: PersonFormPayload,
): DefaultValues<PersonFormValues> => ({
  name: person?.name ?? "",
  email: person?.email || "",
  phone: person?.phone || "",
  address: person?.address || "",
  city: person?.city || "",
  state: person?.state || "",
  zipCode: person?.zipCode || "",
});

const PersonForm = ({
  person,
  mode = "staff",
  cancelHref,
  returnTo,
}: PersonFormProps) => {
  const isEditMode = !!person;
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const resolvedCancelHref =
    cancelHref ??
    returnTo ??
    (isEditMode
      ? `/dashboard/people-directory/${person.id}`
      : "/dashboard/people-directory");

  // Staff-managed records (create + staff edit) require a contact method;
  // self-profile updates don't (see StaffPersonFormSchema's doc comment).
  const validationSchema =
    mode === "self" ? PersonFormSchema : StaffPersonFormSchema;

  const form = useForm<PersonFormValues>({
    resolver: standardSchemaResolver(validationSchema),
    defaultValues: buildDefaultValues(person),
  });

  // The duplicate warning is now local UI state rather than a field on an
  // action-state snapshot, and `lastValues` holds the exact values that
  // produced it — "Continue anyway" must resubmit those, not whatever is in
  // the inputs by the time the button is clicked.
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [lastValues, setLastValues] = useState<PersonFormValues | null>(null);

  const submit = (values: PersonFormValues, confirmDuplicate: boolean) => {
    // Cleared up front, or a corrected email leaves the stale warning on screen.
    setDuplicate(null);
    setLastValues(values);

    startSubmitTransition(async () => {
      const result =
        mode === "self" && isEditMode
          ? await updateMyProfile(values)
          : isEditMode
            ? await updatePerson(
                person.id,
                returnTo ?? null,
                confirmDuplicate,
                values,
              )
            : await createPerson(returnTo ?? null, confirmDuplicate, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
        // Self-profile is a page form that stays mounted: re-baseline isDirty.
        form.reset(values);
        return;
      }

      // Not a failure of the input — the record wasn't written, but nothing is
      // wrong with what was typed. Rendered as an Alert, not a toast.
      if ("reason" in result) {
        setDuplicate(result.duplicate);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const onSubmit = (values: PersonFormValues) => submit(values, false);

  const handleConfirmDuplicate = () => {
    if (!lastValues) return;
    submit(lastValues, true);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-3xl mx-auto @container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">
              {mode === "self"
                ? "My Profile"
                : isEditMode
                  ? "Edit Person"
                  : "New Person"}
            </CardTitle>
            <CardDescription>
              {mode === "self"
                ? "Update your contact information."
                : isEditMode
                  ? `Editing the record for ${person.name}.`
                  : "Register a new contact record — e.g., a walk-in contact or partner."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            {duplicate && (
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">
                  Possible duplicate person
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-400">
                  <span>
                    A person with this {duplicate.matchedOn} already exists:{" "}
                    {duplicate.name}.
                  </span>
                  {duplicate.matchedOn === "email" && (
                    <span>
                      This email is already in use by another person — it
                      can&apos;t be saved here too.
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <Link
                      href={`/dashboard/people-directory/${duplicate.id}`}
                      className="font-semibold underline"
                    >
                      Use them instead
                    </Link>
                    {/* Phone only: an email match is a hard unique constraint,
                        so there is nothing to continue past. */}
                    {duplicate.matchedOn === "phone" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={handleConfirmDuplicate}
                      >
                        Continue anyway
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Contact Information
              </h3>
              {mode !== "self" && (
                <p className="text-sm text-muted-foreground">
                  Provide at least an email or phone number so this person can
                  be contacted.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-4">
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Jane Doe"
                          {...field}
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>
                        Email
                        {mode !== "self" && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (or phone)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., jane@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>
                        Phone
                        {mode !== "self" && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (or email)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., (555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Main St" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Anytown" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>State</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Zip Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={resolvedCancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Creating..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Person"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default PersonForm;