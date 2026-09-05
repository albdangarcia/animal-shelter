"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, Control } from "react-hook-form";
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
import {
  MyAdoptionAppFormSchema,
  type MyAdoptionAppFormInput,
} from "@/app/lib/zod-schemas/myAdoptionApplication.schema";
import { toYesNo, boolToSelectValue } from "@/app/lib/utils/form-utils";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { staffEditPersonApplication } from "@/app/lib/actions/adoption-application.actions";
import { AdoptionApplicationForEditPayload } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import {
  ApplicantFieldsSection,
  ApplicantFieldValues,
} from "./applicant-fields-section";

type FormValues = MyAdoptionAppFormInput;

interface Props {
  application: AdoptionApplicationForEditPayload;
  personId: string;
  returnTo?: string;
}

const StaffAdoptionApplicationEditForm = ({
  application,
  personId,
  returnTo,
}: Props) => {
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(MyAdoptionAppFormSchema),
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
      householdSize: application.householdSize,
      hasYard: toYesNo(application.hasYard),
      landlordPermission: boolToSelectValue(application.landlordPermission),
      hasChildren: toYesNo(application.hasChildren),
      childrenAges: (application.childrenAges ?? []).join(", "),
      otherAnimalsDescription: application.otherAnimalsDescription ?? "",
      animalExperience: application.animalExperience ?? "",
      reasonForAdoption: application.reasonForAdoption,
    },
  });

  // The three ids are ordinary leading arguments now rather than .bind()-ed
  // onto the action. returnTo is still re-checked server-side before it is
  // returned as redirectTo — this action is reachable by direct POST.
  const onSubmit = (values: FormValues) => {
    startSubmitTransition(async () => {
      const result = await staffEditPersonApplication(
        application.id,
        personId,
        returnTo ?? null,
        values,
      );

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
            />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={returnTo ?? "/dashboard/adoption-applications"}>
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