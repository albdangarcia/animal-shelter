"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateFosterApplicationStatus } from "@/app/lib/actions/foster-application.actions";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/app/lib/utils/application-status";
import { FosterApplicationStatusChangeSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { MyFosterApplicationPayload } from "@/app/lib/types";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { HouseholdReadOnlyRows } from "@/components/dashboard/account/household-profile-form";
import {
  CapabilityReadOnlyRows,
  StatusHistoryTimeline,
} from "@/components/dashboard/my-foster-application/foster-application-status";
import { FosterApplicationStatuses } from "@/components/dashboard/foster-applications/table/foster-applications-options";

type StatusChangeFormValues = z.input<typeof FosterApplicationStatusChangeSchema>;

const ApplicantInfoReadOnlyRows = ({
  application,
}: {
  application: MyFosterApplicationPayload;
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Name</span>
      <span>{application.applicantName}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Email</span>
      <span>{application.applicantEmail}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Phone</span>
      <span>{application.applicantPhone}</span>
    </div>
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">Address</span>
      <span className="text-right">
        {application.applicantAddressLine1}
        {application.applicantAddressLine2
          ? `, ${application.applicantAddressLine2}`
          : ""}
        <br />
        {application.applicantCity}, {application.applicantState}{" "}
        {application.applicantZipCode}
      </span>
    </div>
  </div>
);

interface FosterApplicationReviewProps {
  application: MyFosterApplicationPayload;
  canManage: boolean;
}

export function FosterApplicationReview({
  application,
  canManage,
}: FosterApplicationReviewProps) {
  const statusMeta = FosterApplicationStatuses.find(
    (s) => s.value === application.status,
  );

  const allowedNextStatuses = ALLOWED_APPLICATION_TRANSITIONS[application.status];

  const [state, formAction, isPending] = useActionState(
    updateFosterApplicationStatus,
    INITIAL_FORM_STATE,
  );

  const form = useForm<StatusChangeFormValues>({
    resolver: standardSchemaResolver(FosterApplicationStatusChangeSchema),
    defaultValues: {
      applicationId: application.id,
      status: application.status as StatusChangeFormValues["status"],
      statusChangeReason: "",
    },
  });

  useEffect(() => {
    if (state.success) {
      toast.success(state.message ?? "Foster application updated.");
      form.setValue("statusChangeReason", "");
    } else if (state.message) {
      toast.error(state.message);
    }
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        if (value) {
          form.setError(key as keyof StatusChangeFormValues, {
            type: "server",
            message: value.join(", "),
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const newStatus = form.watch("status");
  const isStatusChanging = newStatus && newStatus !== application.status;

  const onSubmit = (data: StatusChangeFormValues) => {
    const formData = new FormData();
    formData.append("applicationId", data.applicationId);
    formData.append("status", data.status);
    formData.append("statusChangeReason", data.statusChangeReason);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Card className={canManage ? "border-primary" : undefined}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {application.applicantName}
            {statusMeta && (
              <Badge variant="outline" className="flex w-fit items-center">
                {statusMeta.icon && (
                  <statusMeta.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                {statusMeta.label}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Foster application submitted {formatDateOrNA(application.submittedAt)}.
          </CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Status *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isPending || allowedNextStatuses.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a new status">
                              {FosterApplicationStatuses.find(
                                (s) => s.value === field.value,
                              )?.label ?? field.value}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedNextStatuses.map((status) => {
                            const meta = FosterApplicationStatuses.find(
                              (s) => s.value === status,
                            );
                            return (
                              <SelectItem key={status} value={status}>
                                {meta?.label ?? status}
                              </SelectItem>
                            );
                          })}
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
                            disabled={isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={isPending || !isStatusChanging}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isPending ? "Updating..." : "Update Status"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applicant Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ApplicantInfoReadOnlyRows application={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Household & Lifestyle</CardTitle>
        </CardHeader>
        <CardContent>
          <HouseholdReadOnlyRows hp={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foster Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <CapabilityReadOnlyRows application={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusHistoryTimeline history={application.history} />
        </CardContent>
      </Card>
    </div>
  );
}
