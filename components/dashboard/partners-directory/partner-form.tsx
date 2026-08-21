"use client";

import {
  createPartner,
  updatePartner,
} from "@/app/lib/actions/partner.actions";
import { useTransition } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, type DefaultValues } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  PartnerFormSchema,
  type PartnerFormInput,
} from "@/app/lib/zod-schemas/partners-directory.schemas";
import { PartnerTypesOptions } from "@/components/dashboard/partners-directory/table/partners-directory-options";
import { US_STATES } from "@/app/lib/constants/us-states";
import Link from "next/link";
import { PartnerFormPayload } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

export type PartnerFormValues = PartnerFormInput;

interface PartnerFormProps {
  partner?: PartnerFormPayload;
  cancelHref?: string;
  returnTo?: string;
}

const buildDefaultValues = (
  partner?: PartnerFormPayload,
): DefaultValues<PartnerFormValues> => ({
  name: partner?.name ?? "",
  // Undefined rather than `"" as PartnerType` on create: the field is
  // legitimately unset before first entry, and the cast claimed an empty
  // string was a valid enum member. The Select stays controlled via `?? ""`.
  type: partner?.type,
  email: partner?.email || "",
  phone: partner?.phone || "",
  website: partner?.website || "",
  address: partner?.address || "",
  city: partner?.city || "",
  state: partner?.state || "",
  zipCode: partner?.zipCode || "",
  isActive: partner?.isActive ?? true,
  notes: partner?.notes || "",
});

const PartnerForm = ({ partner, cancelHref, returnTo }: PartnerFormProps) => {
  const isEditMode = !!partner;
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const resolvedCancelHref =
    cancelHref ??
    returnTo ??
    (isEditMode
      ? `/dashboard/partners-directory/${partner.id}`
      : "/dashboard/partners-directory");

  const form = useForm<PartnerFormValues>({
    resolver: standardSchemaResolver(PartnerFormSchema),
    defaultValues: buildDefaultValues(partner),
  });

  const onSubmit = (values: PartnerFormValues) => {
    startSubmitTransition(async () => {
      // isActive travels as a boolean. The old path had to strip it from the
      // loop, re-append it as "on", and read it back with a `!== null` check,
      // because FormData has no way to carry an unchecked checkbox.
      const result = isEditMode
        ? await updatePartner(partner.id, returnTo ?? null, values)
        : await createPartner(returnTo ?? null, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
        form.reset(values);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-3xl mx-auto @container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">
              {isEditMode ? "Edit Partner" : "New Partner"}
            </CardTitle>
            <CardDescription>
              {isEditMode
                ? `Editing the record for ${partner.name}.`
                : "Register a new partner organization — a shelter, rescue, vet clinic, or agency."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Organization Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-4">
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Westchester Humane Society"
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
                  name="type"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PartnerTypesOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                  name="email"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., intake@example.org"
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., (555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., https://example.org"
                          {...field}
                        />
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

            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">Status & Notes</h3>
              <div className="space-y-8">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active partner</FormLabel>
                        <FormDescription>
                          Uncheck to retire this partner without deleting it.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quick note</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Transfers weekdays only."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        A short pinned blurb. Dated note history lives on the
                        partner&apos;s detail page.
                      </FormDescription>
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
                  : "Create Partner"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default PartnerForm;