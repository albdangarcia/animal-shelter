"use client";

import { startTransition, useActionState, useEffect } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import { StaffAdoptionApplicationFormSchema } from "@/app/lib/zod-schemas/application.schemas";
import {
  INITIAL_FORM_STATE,
  StaffAdoptionApplicationFormState,
} from "@/app/lib/form-state-types";
import { HouseholdProfilePayload } from "@/app/lib/types";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";

type FormValues = z.input<typeof StaffAdoptionApplicationFormSchema>;

interface Props {
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    householdProfile: HouseholdProfilePayload | null;
  };
}

const StaffAdoptionApplicationForm = ({ person }: Props) => {
  const hp = person.householdProfile;

  // TODO: replace with real action in Task 05
  const action = async (
    _: StaffAdoptionApplicationFormState,
    __: FormData,
  ): Promise<StaffAdoptionApplicationFormState> => ({});

  const [state, formAction, isPending] = useActionState<
    StaffAdoptionApplicationFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(StaffAdoptionApplicationFormSchema),
    defaultValues: {
      applicantName: person.name,
      applicantEmail: person.email || "",
      applicantPhone: person.phone || "",
      applicantAddressLine1: person.address || "",
      applicantAddressLine2: "",
      applicantCity: person.city || "",
      applicantState: person.state || "",
      applicantZipCode: person.zipCode || "",
      livingSituation: hp?.livingSituation || livingSituationOptions[0].value,
      householdSize: String(hp?.householdSize ?? 1),
      hasYard: boolToSelectValue(hp?.hasYard),
      landlordPermission: boolToSelectValue(hp?.landlordPermission),
      hasChildren: boolToSelectValue(hp?.hasChildren),
      childrenAges: hp?.childrenAges?.join(", ") || "",
      otherAnimalsDescription: hp?.otherAnimalsDescription || "",
      animalExperience: hp?.animalExperience || "",
      reasonForAdoption: "",
      animalId: "",
    },
  });

  const hasChildren = form.watch("hasChildren");

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof FormValues, {
          type: "server",
          message: Array.isArray(value) ? value.join(", ") : String(value),
        });
      }
    }
  }, [state, form]);

  const onSubmit = (data: FormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value != null && value !== "") {
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
        <Card className="w-full max-w-3xl mx-auto @container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">
              New Adoption Application
            </CardTitle>
            <CardDescription>
              Submitting on behalf of {person.name}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Section 1 — Applicant Information */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Applicant Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="applicantName"
                  render={({ field }) => (
                    <FormItem className="col-span-4">
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicantEmail"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Email</FormLabel>
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
                  name="applicantPhone"
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
                  name="applicantAddressLine1"
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
                  name="applicantAddressLine2"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
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
                <FormField
                  control={form.control}
                  name="applicantCity"
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
                  name="applicantState"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>State</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map((s) => (
                            <SelectItem key={s.code} value={s.code}>
                              {s.name}
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

            {/* Section 2 — Household & Lifestyle */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Household &amp; Lifestyle
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="livingSituation"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Living Situation</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select living situation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {livingSituationOptions.map((option) => (
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
                  name="householdSize"
                  render={({ field }) => (
                    <FormItem className="col-span-3">
                      <FormLabel>Household Size</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? ""
                                : parseInt(e.target.value, 10),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasYard"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Has Yard</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="landlordPermission"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Landlord Permission</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasChildren"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Has Children</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Not specified" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {hasChildren === "true" && (
                  <FormField
                    control={form.control}
                    name="childrenAges"
                    render={({ field }) => (
                      <FormItem className="col-span-full">
                        <FormLabel>Children Ages</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 5, 8, 12" {...field} />
                        </FormControl>
                        <FormDescription>
                          Enter ages separated by commas.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="otherAnimalsDescription"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Other Animals Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe any other pets currently in the household."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="animalExperience"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Animal Experience</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe experience caring for pets."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Section 3 — Application Details */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Application Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
                <FormField
                  control={form.control}
                  name="reasonForAdoption"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Reason for Adoption</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Why does this person want to adopt at this time?"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <input type="hidden" name="animalId" value="" />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button asChild variant="outline" type="button" disabled={isPending}>
              <Link
                href={`/dashboard/people-directory/${person.id}/adoption-applications`}
              >
                Cancel
              </Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default StaffAdoptionApplicationForm;
