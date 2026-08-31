"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { ArrowRight, Info, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { AdoptionApplicationWithOutcome } from "@/app/lib/data/user-adoption-application.data";
import { staffUpdateAdoptionApp } from "@/app/lib/actions/adoption-application.actions";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { AnimalForAdoptionApplicationPayload } from "@/app/lib/types";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/app/lib/utils/application-status";
import {
  formatSingleEnumOption,
  livingSituationOptions,
} from "@/app/lib/utils/enum-formatter";
import {
  StaffUpdateAdoptionAppFormSchema,
  type StaffUpdateAdoptionAppFormInput,
} from "@/app/lib/zod-schemas/application.schemas";
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

type StaffUpdateFormData = StaffUpdateAdoptionAppFormInput;

interface StaffApplicationUpdateFormProps {
  animal: AnimalForAdoptionApplicationPayload;
  application: AdoptionApplicationWithOutcome;
}

export function StaffApplicationUpdateForm({
  animal,
  application,
}: StaffApplicationUpdateFormProps) {
  const isAdopted = application.status === "ADOPTED";
  const isApproved = application.status === "APPROVED";
  const outcome = application.outcome;
  const isWalkIn = application.applicant?.user === null;

  const currentStatus = application.status;
  const allowedNextStatuses = ALLOWED_APPLICATION_TRANSITIONS[currentStatus];

  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const form = useForm<StaffUpdateFormData>({
    resolver: standardSchemaResolver(StaffUpdateAdoptionAppFormSchema),
    defaultValues: {
      status: application.status as StaffUpdateFormData["status"],
      internalNotes: application.internalNotes ?? "",
      statusChangeReason: "",
    },
  });

  const newStatus = useWatch({ control: form.control, name: "status" });
  const isStatusChanging = newStatus && newStatus !== currentStatus;

  // Every message the action returns used to be toasted as an error, because
  // the effect draining action state had no way to tell success from failure.
  const handleFormSubmit = (values: StaffUpdateFormData) => {
    if (isAdopted) return;
    startSubmitTransition(async () => {
      const result = await staffUpdateAdoptionApp(application.id, values);

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
              {isWalkIn && (
                <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
                  <Link
                    href={`/dashboard/people-directory/${application.applicantId}/adoption-applications/${application.id}/edit?callbackUrl=/dashboard/adoption-applications/${application.id}/edit`}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit Application Fields
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isAdopted && outcome && (
                <Alert className="mb-6 border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertTitle className="text-blue-800 dark:text-blue-200">
                    Application Finalized
                  </AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    This application was finalized on{" "}
                    {new Date(outcome.outcomeDate).toLocaleDateString()}.
                    <Link
                      href={`/dashboard/outcomes/${outcome.id}/edit`}
                      className="ml-2 font-semibold text-blue-800 underline hover:text-blue-600 dark:text-blue-200 dark:hover:text-blue-400"
                    >
                      View Outcome Record
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
              {isApproved && (
                <Alert className="mb-6 border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <Info className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertTitle className="text-green-800 dark:text-green-200">
                    Next Step: Finalize Adoption
                  </AlertTitle>
                  <AlertDescription className="flex items-center justify-between text-green-700 dark:text-green-300">
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
                        value={field.value ?? ""}
                        disabled={isPending || allowedNextStatuses.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a new status">
                              {formatSingleEnumOption(field.value)}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedNextStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {formatSingleEnumOption(status)}
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