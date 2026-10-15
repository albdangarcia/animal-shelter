"use client";

import { createReIntake } from "@/app/lib/actions/intake.actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
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
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { AnimalReIntakeFormPayload, PartnerPayload } from "@/app/lib/types";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import {
  ReIntakeFormSchema,
  type ReIntakeFormInput,
} from "@/app/lib/zod-schemas/intake.schema";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

interface ReIntakeFormProps {
  animal: AnimalReIntakeFormPayload;
  partners: PartnerPayload[];
  canCreatePerson?: boolean;
  /**
   * Today, on the shelter's calendar, resolved on the server. It is the day an
   * intake recorded now is filed under — a `new Date()` here would be
   * re-resolved in the viewer's zone, so the server render and the browser's
   * could disagree by a day.
   */
  today: CalendarDay;
}

const ReIntakeForm = ({
  animal,
  partners,
  canCreatePerson,
  today,
}: ReIntakeFormProps) => {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<ReIntakeFormInput>({
    resolver: standardSchemaResolver(ReIntakeFormSchema),
    defaultValues: {
      // Today on the shelter's calendar, which is the day an intake recorded
      // now is filed under.
      intakeDate: today,
      intakeType: undefined,
      notes: "",
      sourcePartnerId: "",
      foundAddress: "",
      foundCity: "",
      foundState: "",
      surrenderingPersonId: "",
    },
  });

  const onSubmit = (values: ReIntakeFormInput) => {
    startSubmitTransition(async () => {
      const result = await createReIntake(animal.id, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
        }
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="@container space-y-8">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Re-Intake Animal: {animal.name}</CardTitle>
            <CardDescription>
              This animal is returning to the shelter. Record the new intake
              details below to reactivate their profile.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Intake Fields Component */}
            <IntakeFormFields
              control={form.control}
              partners={partners}
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
              <Link href={`/dashboard/animals/${animal.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Processing..." : "Process Re-Intake"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default ReIntakeForm;
