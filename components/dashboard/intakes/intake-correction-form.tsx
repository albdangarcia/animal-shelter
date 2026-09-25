"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { IntakeFormFields } from "@/components/dashboard/animals/intake-form-fields";
import { updateIntake } from "@/app/lib/actions/intake.actions";
import {
  IntakeCorrectionFormSchema,
  type IntakeCorrectionFormInput,
} from "@/app/lib/zod-schemas/intake.schema";
import type { IntakeForCorrection } from "@/app/lib/data/animals/intake.data";
import type { PartnerPayload } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

interface IntakeCorrectionFormProps {
  intake: IntakeForCorrection;
  partners: PartnerPayload[];
  canCreatePerson?: boolean;
  /** Today on the shelter's calendar, resolved on the server. */
  today: CalendarDay;
}

// The row as it is stored, in the form's terms. A column the row leaves empty
// is "", which the action reads back as empty, so an untouched field is not a
// change.
const buildDefaultValues = (
  intake: IntakeForCorrection,
): IntakeCorrectionFormInput => ({
  intakeDate: intake.intakeDate,
  intakeType: intake.type,
  notes: intake.notes ?? "",
  sourcePartnerId: intake.sourcePartnerId ?? "",
  foundAddress: intake.foundAddress ?? "",
  foundCity: intake.foundCity ?? "",
  foundState: intake.foundState ?? "",
  surrenderingPersonId: intake.surrenderingPersonId ?? "",
});

export function IntakeCorrectionForm({
  intake,
  partners,
  canCreatePerson,
  today,
}: IntakeCorrectionFormProps) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<IntakeCorrectionFormInput>({
    resolver: standardSchemaResolver(IntakeCorrectionFormSchema),
    defaultValues: buildDefaultValues(intake),
  });

  const handleFormSubmit = (values: IntakeCorrectionFormInput) => {
    startSubmitTransition(async () => {
      const result = await updateIntake(intake.id, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
        form.reset(values);
        return;
      }

      // A refused date comes back as an error on the date field as well as
      // the message, so it shows under the picker.
      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="@container space-y-8"
      >
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Edit Intake</CardTitle>
            <CardDescription>
              Correct the intake details recorded for {intake.animal.name}.
              Recorded by {intake.staffMember.name}.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <IntakeFormFields
              control={form.control}
              partners={partners}
              // The person on record, named, so the picker shows who it holds
              // rather than an empty search box. Not a suggestion: this form
              // has nothing to fill in.
              initialSurrenderingPerson={
                intake.surrenderingPerson ?? undefined
              }
              canCreatePerson={canCreatePerson}
              today={today}
            />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href="/dashboard/intakes">Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Updating..." : "Update Intake"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
