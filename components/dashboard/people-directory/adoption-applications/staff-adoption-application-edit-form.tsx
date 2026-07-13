"use client";

import { startTransition, useActionState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Control, UseFormWatch } from "react-hook-form";
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
import { Form } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";
import { MyAdoptionAppFormSchema } from "@/app/lib/zod-schemas/myAdoptionApplication.schema";
import {
  INITIAL_FORM_STATE,
  StaffAdoptionApplicationFormState,
} from "@/app/lib/form-state-types";
import { toYesNo, buildApplicationFormData } from "@/app/lib/utils/form-utils";
import { staffEditPersonApplication } from "@/app/lib/actions/adoption-application.actions";
import { PersonApplicationForEditPayload } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import {
  ApplicantFieldsSection,
  ApplicantFieldValues,
} from "./applicant-fields-section";

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
    callbackUrl ?? null,
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
    startTransition(() => {
      formAction(buildApplicationFormData(data));
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
            {/* Shared applicant fields */}
            <ApplicantFieldsSection
              control={form.control as unknown as Control<ApplicantFieldValues>}
              watch={
                form.watch as unknown as UseFormWatch<ApplicantFieldValues>
              }
            />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
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