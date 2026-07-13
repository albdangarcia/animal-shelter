"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";
import { createMyFosterApplication } from "@/app/lib/actions/foster-application.actions";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { FosterApplicationFormSchema } from "@/app/lib/zod-schemas/foster.schemas";
import {
  HouseholdFormFields,
  HouseholdProfileFormValues,
} from "@/components/dashboard/account/household-profile-form";
import { FosterCapabilityFormFields } from "./foster-capability-form-fields";
import { FosterApplicantDefaultsPayload } from "@/app/lib/data/fosters/my-foster-application.data";

type FosterApplicationFormValues = z.input<typeof FosterApplicationFormSchema>;

interface MyFosterApplicationFormProps {
  applicantDefaults?: FosterApplicantDefaultsPayload | null;
  species: { id: string; name: string }[];
}

export function MyFosterApplicationForm({
  applicantDefaults,
  species,
}: MyFosterApplicationFormProps) {
  const [state, formAction, isPending] = useActionState(
    createMyFosterApplication,
    INITIAL_FORM_STATE,
  );

  const household = applicantDefaults?.householdProfile;

  const form = useForm<FosterApplicationFormValues>({
    resolver: standardSchemaResolver(FosterApplicationFormSchema),
    defaultValues: {
      applicantName: applicantDefaults?.name ?? "",
      applicantEmail: applicantDefaults?.email ?? "",
      applicantPhone: applicantDefaults?.phone ?? "",
      applicantAddressLine1: applicantDefaults?.address ?? "",
      applicantAddressLine2: "",
      applicantCity: applicantDefaults?.city ?? "",
      applicantState: applicantDefaults?.state ?? "",
      applicantZipCode: applicantDefaults?.zipCode ?? "",
      livingSituation: household?.livingSituation || livingSituationOptions[0].value,
      hasYard: boolToSelectValue(household?.hasYard),
      landlordPermission: boolToSelectValue(household?.landlordPermission),
      hasChildren: boolToSelectValue(household?.hasChildren),
      householdSize: String(household?.householdSize ?? 1),
      childrenAges: household?.childrenAges?.join(", ") || "",
      otherAnimalsDescription: household?.otherAnimalsDescription || "",
      animalExperience: household?.animalExperience || "",
      speciesIds: [],
      maxAnimals: "1",
      hasQuarantineSpace: undefined,
      canGiveOralMeds: undefined,
      canBottleFeed: undefined,
      canTransport: undefined,
      acceptsMedical: undefined,
      acceptsHospice: undefined,
      availabilityNotes: "",
    },
  });

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof FosterApplicationFormValues, {
          type: "server",
          message: Array.isArray(value) ? value.join(", ") : String(value),
        });
      }
    }
  }, [state, form]);

  const onSubmit = (data: FosterApplicationFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (key === "speciesIds") {
        (value as string[] | undefined)?.forEach((id) =>
          formData.append("speciesIds", id),
        );
      } else if (value != null) {
        // Empty string is a meaningful value here (e.g. childrenAges when
        // hasChildren is "false") — omitting it would drop a key the server
        // schema requires to be present, failing validation invisibly since
        // the corresponding field isn't always rendered.
        formData.append(key, String(value));
      }
    }
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Applicant Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="applicantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="applicantEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="you@example.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="applicantPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone *</FormLabel>
                    <FormControl>
                      <Input placeholder="(123) 456-7890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Separator />
            <div className="space-y-6">
              <FormField
                control={form.control}
                name="applicantAddressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1 *</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="applicantAddressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Apt, Suite, etc. (Optional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="applicantCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicantState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
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
                  name="applicantZipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Household & Lifestyle</CardTitle>
            <CardDescription>
              Prefilled from your profile — update anything that&apos;s
              changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <HouseholdFormFields
              form={
                form as unknown as UseFormReturn<HouseholdProfileFormValues>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Foster Capabilities</CardTitle>
            <CardDescription>
              Tell us what kind of fostering you&apos;re able to take on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <FosterCapabilityFormFields form={form} species={species} />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? "Submitting..." : "Submit Application"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
