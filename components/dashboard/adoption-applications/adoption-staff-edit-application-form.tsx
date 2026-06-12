"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApplicationStatus } from "@prisma/client";
import { ArrowRight, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApplicationWithOutcome } from "@/app/lib/data/user-application.data";
import { staffUpdateAdoptionApp } from "@/app/lib/actions/adoption-application.actions";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { AnimalForApplicationPayload } from "@/app/lib/types";
import {
  formatSingleEnumOption,
  livingSituationOptions,
} from "@/app/lib/utils/enum-formatter";
import { StaffUpdateAdoptionAppFormSchema } from "@/app/lib/zod-schemas/application.schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type StaffUpdateFormData = z.infer<typeof StaffUpdateAdoptionAppFormSchema>;

const updatableApplicationStatuses = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

type StatusOption = {
  value: ApplicationStatus;
  label: string;
};

interface StaffApplicationUpdateFormProps {
  animal: AnimalForApplicationPayload;
  application: ApplicationWithOutcome;
}

export function StaffApplicationUpdateForm({
  animal,
  application,
}: StaffApplicationUpdateFormProps) {
  const isAdopted = application.status === "ADOPTED";
  const isApproved = application.status === "APPROVED";
  const outcome = application.outcome;

  const applicationStatusOptions: StatusOption[] =
    updatableApplicationStatuses.map((status) => ({
      value: status,
      label: formatSingleEnumOption(status),
    }));

  if (isAdopted) {
    applicationStatusOptions.unshift({
      value: "ADOPTED",
      label: "Adopted",
    });
  }

  const action = staffUpdateAdoptionApp.bind(null, application.id);
  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_FORM_STATE
  );

  const form = useForm<StaffUpdateFormData>({
    resolver: zodResolver(StaffUpdateAdoptionAppFormSchema),
    defaultValues: {
      status:
        application.status as (typeof updatableApplicationStatuses)[number],
      internalNotes: application.internalNotes ?? "",
      statusChangeReason: "",
    },
  });

  const currentStatus = application.status;
  const newStatus = useWatch({ control: form.control, name: "status" });
  const isStatusChanging = newStatus && newStatus !== currentStatus;

  useEffect(() => {
    // If the server returns any message, it's an error. Show a toast.
    if (state.message) {
      toast.error(state.message);
    }

    // If there are specific field errors, update the form fields.
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        if (value) {
          form.setError(key as keyof StaffUpdateFormData, {
            type: "server",
            message: value.join(", "),
          });
        }
      }
    }
  }, [state, form]);

  const handleFormSubmit = (data: StaffUpdateFormData) => {
    if (isAdopted) return;
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-8"
        >
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>Staff Actions</CardTitle>
              <CardDescription className="flex items-center pt-1">
                Reviewing application from
                <span className="font-semibold mx-1">
                  {application.applicantName}
                </span>
                for
                <Button variant="link" asChild className="p-1 h-auto">
                  <Link href={`/dashboard/animals/${animal.id}`}>
                    {animal.name}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAdopted && outcome && (
                <Alert className="mb-6 border-blue-300 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">
                    Application Finalized
                  </AlertTitle>
                  <AlertDescription className="text-blue-700">
                    This application was finalized on{" "}
                    {new Date(outcome.outcomeDate).toLocaleDateString()}.
                    <Link
                      href={`/dashboard/outcomes/${outcome.id}/edit`}
                      className="ml-2 font-semibold text-blue-800 underline hover:text-blue-600"
                    >
                      View Outcome Record
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
              {isApproved && (
                <Alert className="mb-6 border-green-300 bg-green-50">
                  <Info className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">
                    Next Step: Finalize Adoption
                  </AlertTitle>
                  <AlertDescription className="flex items-center justify-between text-green-700">
                    <span>
                      This application is approved and ready for the final step.
                    </span>
                    <Button asChild>
                      <Link
                        href={`/dashboard/outcomes/create?applicationId=${application.id}`}
                      >
                        Create Outcome
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Status *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isPending || isAdopted}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a new status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {applicationStatusOptions.map((option) => (
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

                {isStatusChanging && (
                  <FormField
                    control={form.control}
                    name="statusChangeReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason for Status Change *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Provide a reason for changing the status..."
                            className="resize-y"
                            disabled={isPending || isAdopted}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          This reason will be logged in the application history.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="internalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add or update internal notes for staff view only."
                          className="resize-y min-h-25"
                          disabled={isPending || isAdopted}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* All sections below are READ-ONLY */}

          <Card>
            <CardHeader>
              <CardTitle>Applicant Information (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      value={application.applicantName}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      value={application.applicantEmail}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      value={application.applicantPhone}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
              </div>
              <Separator />
              <div className="space-y-6">
                <FormItem>
                  <FormLabel>Address Line 1</FormLabel>
                  <FormControl>
                    <Input
                      value={application.applicantAddressLine1}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Address Line 2</FormLabel>
                  <FormControl>
                    <Input
                      value={application.applicantAddressLine2 ?? ""}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        value={application.applicantCity}
                        disabled
                        readOnly
                      />
                    </FormControl>
                  </FormItem>
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <Select value={application.applicantState} disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((state) => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                  <FormItem>
                    <FormLabel>ZIP Code</FormLabel>
                    <FormControl>
                      <Input
                        value={application.applicantZipCode}
                        disabled
                        readOnly
                      />
                    </FormControl>
                  </FormItem>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Home & Lifestyle (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormItem>
                  <FormLabel>Living Situation</FormLabel>
                  <Select value={application.livingSituation} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {livingSituationOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <FormLabel>Household Size</FormLabel>
                  <FormControl>
                    <Input
                      value={application.householdSize}
                      disabled
                      readOnly
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Do you have a yard?</FormLabel>
                  <RadioGroup
                    value={application.hasYard ? "true" : "false"}
                    disabled
                  >
                    <div className="flex items-center space-x-4">
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
                    </div>
                  </RadioGroup>
                </FormItem>
                <FormItem>
                  <FormLabel>
                    If you rent, do you have landlord permission?
                  </FormLabel>
                  <RadioGroup
                    value={application.landlordPermission ? "true" : "false"}
                    disabled
                  >
                    <div className="flex items-center space-x-4">
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
                    </div>
                  </RadioGroup>
                </FormItem>
                <FormItem>
                  <FormLabel>Are there children in the home?</FormLabel>
                  <RadioGroup
                    value={application.hasChildren ? "true" : "false"}
                    disabled
                  >
                    <div className="flex items-center space-x-4">
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
                    </div>
                  </RadioGroup>
                </FormItem>
                {application.hasChildren && (
                  <FormItem>
                    <FormLabel>Children&apos;s Ages</FormLabel>
                    <FormControl>
                      <Input
                        value={application.childrenAges?.join(", ") ?? "N/A"}
                        disabled
                        readOnly
                      />
                    </FormControl>
                  </FormItem>
                )}
              </div>
              <Separator />
              <FormItem>
                <FormLabel>Other Animals in the Home</FormLabel>
                <FormControl>
                  <Textarea
                    value={application.otherAnimalsDescription ?? "N/A"}
                    className="resize-y"
                    disabled
                    readOnly
                  />
                </FormControl>
              </FormItem>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Experience & Intent (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormItem>
                <FormLabel>Animal Experience</FormLabel>
                <FormControl>
                  <Textarea
                    value={application.animalExperience ?? "N/A"}
                    className="resize-y min-h-25"
                    disabled
                    readOnly
                  />
                </FormControl>
              </FormItem>
              <FormItem>
                <FormLabel>Reason for Adoption</FormLabel>
                <FormControl>
                  <Textarea
                    value={application.reasonForAdoption}
                    className="resize-y min-h-25"
                    disabled
                    readOnly
                  />
                </FormControl>
              </FormItem>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href="/dashboard/adoption-applications">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending || isAdopted}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Updating..." : "Update Application"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
