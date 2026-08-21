"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  createMyAdoptionApp,
  updateMyAdoptionApp,
} from "@/app/lib/actions/my-adoption-application.actions";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  AdoptionApplicationPayload,
  AnimalForAdoptionApplicationPayload,
} from "@/app/lib/types";
import {
  MyAdoptionAppFormSchema,
  type MyAdoptionAppFormInput,
} from "@/app/lib/zod-schemas/myAdoptionApplication.schema";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { AdoptionApplicantDefaultsPayload } from "@/app/lib/data/my-adoption-applications.data";
import { toYesNo, boolToSelectValue } from "@/app/lib/utils/form-utils";
import { NumberInput } from "@/components/forms/number-input";
import { isRenting } from "@/app/lib/zod-schemas/household-profile.schemas";

type MyApplicationFormData = MyAdoptionAppFormInput;

interface MyApplicationFormProps {
  animal: AnimalForAdoptionApplicationPayload;
  application?: AdoptionApplicationPayload;
  applicantDefaults?: AdoptionApplicantDefaultsPayload | null;
}

export function MyApplicationForm({
  animal,
  application,
  applicantDefaults,
}: MyApplicationFormProps) {
  const isEditMode = !!application;

  const cancelHref = isEditMode
    ? "/dashboard/my-adoption-applications"
    : `/pets/${animal.id}`;

  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const household = applicantDefaults?.householdProfile;

  const form = useForm<MyApplicationFormData>({
    resolver: standardSchemaResolver(MyAdoptionAppFormSchema),
    // Contextually a DefaultValues<T>, so livingSituation is allowed to be
    // undefined here — it legitimately has no value until one is picked.
    defaultValues: {
      applicantName:
        application?.applicantName ?? applicantDefaults?.name ?? "",
      applicantEmail:
        application?.applicantEmail ?? applicantDefaults?.email ?? "",
      applicantPhone:
        application?.applicantPhone ?? applicantDefaults?.phone ?? "",
      applicantAddressLine1:
        application?.applicantAddressLine1 ?? applicantDefaults?.address ?? "",
      applicantAddressLine2: application?.applicantAddressLine2 ?? "",
      applicantCity:
        application?.applicantCity ?? applicantDefaults?.city ?? "",
      applicantState:
        application?.applicantState ?? applicantDefaults?.state ?? "",
      applicantZipCode:
        application?.applicantZipCode ?? applicantDefaults?.zipCode ?? "",
      livingSituation:
        application?.livingSituation ?? household?.livingSituation,
      hasYard: toYesNo(application?.hasYard ?? household?.hasYard),
      landlordPermission: boolToSelectValue(
        application?.landlordPermission ?? household?.landlordPermission,
      ),
      hasChildren: toYesNo(application?.hasChildren ?? household?.hasChildren),
      householdSize:
        application?.householdSize ?? household?.householdSize ?? 1,
      childrenAges:
        application?.childrenAges?.join(", ") ??
        household?.childrenAges?.join(", ") ??
        "",
      otherAnimalsDescription:
        application?.otherAnimalsDescription ??
        household?.otherAnimalsDescription ??
        "",
      animalExperience:
        application?.animalExperience ?? household?.animalExperience ?? "",
      reasonForAdoption: application?.reasonForAdoption ?? "",
    },
  });

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize safely, so it skips compiling the whole component.
  const hasChildrenValue = useWatch({
    control: form.control,
    name: "hasChildren",
  });
  const livingSituation = useWatch({
    control: form.control,
    name: "livingSituation",
  });
  const renting = isRenting(livingSituation);

  // Ids are ordinary leading arguments now instead of .bind()-ed onto the
  // action, so the create/edit choice is made at the call site.
  const handleFormSubmit = (values: MyApplicationFormData) => {
    startSubmitTransition(async () => {
      const result = isEditMode
        ? await updateMyAdoptionApp(application.id, values)
        : await createMyAdoptionApp(animal.id, values);

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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Animal Information Header */}
      <Card>
        <CardHeader>
          <CardTitle>Adoption Application</CardTitle>
          <CardDescription>
            You are applying to adopt {animal.name}, a wonderful{" "}
            {animal.breeds.length > 0
              ? `${animal.breeds.map((b) => b.name).join(" / ")} (${
                  animal.species.name
                })`
              : animal.species.name}
            .
          </CardDescription>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-8"
        >
          {/* Section 1: Applicant Information */}
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
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
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

          {/* Section 2: Home & Lifestyle */}
          <Card>
            <CardHeader>
              <CardTitle>Home & Lifestyle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="livingSituation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Living Situation *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your living situation" />
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
                {/* Raw FormField rather than NumberField: this one carries a
                    FormDescription, which the wrapper has no slot for. */}
                <FormField
                  control={form.control}
                  name="householdSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Household Size *</FormLabel>
                      <FormControl>
                        <NumberInput min={1} max={50} {...field} />
                      </FormControl>
                      <FormDescription>
                        Including yourself, how many people live in your home?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasYard"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        Do you have a yard? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                          className="flex items-center space-x-4"
                        >
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="true" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="false" />
                            </FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {renting && (
                  <FormField
                    control={form.control}
                    name="landlordPermission"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <div className="text-sm font-medium">
                          Do you have landlord permission? *
                        </div>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                            className="flex items-center space-x-4"
                          >
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="true" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Yes
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="false" />
                              </FormControl>
                              <FormLabel className="font-normal">No</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="hasChildren"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        Are there children in the home? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                          className="flex items-center space-x-4"
                        >
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="true" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="false" />
                            </FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conditional rendering now checks for the string 'true' */}
                {hasChildrenValue === "true" && (
                  <FormField
                    control={form.control}
                    name="childrenAges"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Children&apos;s Ages *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 5, 12, 15" {...field} />
                        </FormControl>
                        <FormDescription>
                          Please provide a comma-separated list of ages.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <Separator />
              <FormField
                control={form.control}
                name="otherAnimalsDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Animals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe other animals in the home (species, age, temperament, etc.)."
                        className="resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Section 3: Experience & Intent */}
          <Card>
            <CardHeader>
              <CardTitle>Experience & Intent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormField
                control={form.control}
                name="animalExperience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal Experience *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe your experience with animals, including past ownership."
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reasonForAdoption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Adoption *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Why do you want to adopt at this time? What are you looking for in a companion?"
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Submitting..."
                : isEditMode
                  ? "Update Application"
                  : "Submit Application"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
