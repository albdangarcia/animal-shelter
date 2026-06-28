"use client";

import { startTransition, useActionState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";
import { MyAdoptionAppFormSchema } from "@/app/lib/zod-schemas/myApplication.schema";
import {
  INITIAL_FORM_STATE,
  StaffAdoptionApplicationFormState,
} from "@/app/lib/form-state-types";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { toYesNo } from "@/app/lib/utils/form-utils";
import { staffEditPersonApplication } from "@/app/lib/actions/adoption-application.actions";
import { PersonApplicationForEditPayload } from "@/app/lib/data/people-directory/person-adoption-applications.data";

type FormValues = z.infer<typeof MyAdoptionAppFormSchema>;

interface Props {
  application: PersonApplicationForEditPayload;
  personId: string;
  callbackUrl?: string;
}

const StaffAdoptionApplicationEditForm = ({
  application,
  personId,
  callbackUrl,
}: Props) => {
  const action = staffEditPersonApplication.bind(
    null,
    application.id,
    personId,
    callbackUrl ?? null
  );

  const [state, formAction, isPending] = useActionState<
    StaffAdoptionApplicationFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<FormValues>({
    resolver: zodResolver(MyAdoptionAppFormSchema),
    defaultValues: {
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      applicantPhone: application.applicantPhone,
      applicantAddressLine1: application.applicantAddressLine1,
      applicantAddressLine2: application.applicantAddressLine2 ?? "",
      applicantCity: application.applicantCity,
      applicantState: application.applicantState,
      applicantZipCode: application.applicantZipCode,
      livingSituation: application.livingSituation,
      householdSize: String(application.householdSize),
      hasYard: toYesNo(application.hasYard),
      landlordPermission: toYesNo(application.landlordPermission),
      hasChildren: toYesNo(application.hasChildren),
      childrenAges: (application.childrenAges ?? []).join(", "),
      otherAnimalsDescription: application.otherAnimalsDescription ?? "",
      animalExperience: application.animalExperience ?? "",
      reasonForAdoption: application.reasonForAdoption,
    },
  });

  const hasChildrenValue = form.watch("hasChildren");

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
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
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
              Edit Adoption Application
            </CardTitle>
            <CardDescription>
              Editing application for{" "}
              <Badge variant="secondary" className="text-sm py-0.5 px-2">
                {application.animal.name} &middot;{" "}
                {application.animal.species.name}
              </Badge>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Section 1 — Applicant Information */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Applicant Information
              </h3>
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
                          type="email"
                          placeholder="you@example.com"
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
                            <SelectTrigger>
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
            </div>

            {/* Section 2 — Home & Lifestyle */}
            <div className="space-y-8">
              <h3 className="font-semibold border-b pb-2">Home &amp; Lifestyle</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="livingSituation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Living Situation *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
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
                    <FormItem>
                      <FormLabel>Household Size *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormDescription>
                        Including themselves, how many people live in the home?
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
                        Do they have a yard? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
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
                <FormField
                  control={form.control}
                  name="landlordPermission"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <div className="text-sm font-medium">
                        If they rent, do they have landlord permission? *
                      </div>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
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
                          value={field.value}
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
            </div>

            {/* Section 3 — Experience & Intent */}
            <div className="space-y-8">
              <h3 className="font-semibold border-b pb-2">
                Experience &amp; Intent
              </h3>
              <FormField
                control={form.control}
                name="animalExperience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal Experience *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe their experience with animals, including past ownership."
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
                        placeholder="Why does this person want to adopt at this time?"
                        className="resize-y min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button asChild variant="outline" type="button" disabled={isPending}>
              <Link
                href={
                  callbackUrl ??
                  `/dashboard/people-directory/${personId}/adoption-applications`
                }
              >
                Cancel
              </Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default StaffAdoptionApplicationEditForm;
