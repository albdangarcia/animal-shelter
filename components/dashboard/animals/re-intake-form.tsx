"use client";

import { createReIntake } from "@/app/lib/actions/intake.actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Form, FormField } from "@/components/ui/form";
import { AnimalReIntakeFormPayload, PartnerPayload } from "@/app/lib/types";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import {
  ReIntakeFormSchema,
  type ReIntakeFormInput,
} from "@/app/lib/zod-schemas/intake.schema";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { parseCalendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import type { ReIntakeProtocolPreview } from "@/app/lib/data/medical-protocol.data";
import {
  spayNeuterFactsOn,
  type ProtocolPlanFacts,
} from "@/app/lib/utils/medical-protocol-plan";
import { ProtocolPreview } from "./protocol-preview";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";

interface ReIntakeFormProps {
  animal: AnimalReIntakeFormPayload;
  partners: PartnerPayload[];
  canCreatePerson?: boolean;
  /**
   * The live protocols and what the animal's record says, for a viewer who
   * may manage medical care: the form shows the protocol that fits the
   * returning animal and what it will schedule, and lets them leave it out.
   * Null for anyone else, whose re-intake applies it with no choice.
   */
  protocolPreview?: ReIntakeProtocolPreview | null;
  /**
   * Today, on the shelter's calendar, resolved on the server. It is the day an
   * intake recorded now is filed under — a `new Date()` here would be
   * re-resolved in the viewer's zone, so the server render and the browser's
   * could disagree by a day.
   */
  today: CalendarDay;
  /** The guide the header's "?" opens, or null for no "?". */
  help?: HelpLinkGuide | null;
}

const ReIntakeForm = ({
  animal,
  partners,
  canCreatePerson,
  protocolPreview = null,
  today,
  help = null,
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
      applyProtocol: true,
    },
  });

  // What the protocol's plan reads: the animal and its record as the page
  // read them, on the day the form says it came back.
  const intakeDate = parseCalendarDay(
    useWatch({ control: form.control, name: "intakeDate" }),
  );
  const protocolFacts: ProtocolPlanFacts | null =
    protocolPreview && intakeDate
      ? {
          ...protocolPreview.animal,
          intakeDate,
          ...spayNeuterFactsOn(protocolPreview.record.spayNeuterEntries, intakeDate),
          chipped: protocolPreview.record.chipped,
          openScheduled: protocolPreview.record.openScheduled,
        }
      : null;

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
            {help && (
              <CardAction>
                <HelpLink guide={help} />
              </CardAction>
            )}
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Intake Fields Component */}
            <IntakeFormFields
              control={form.control}
              partners={partners}
              canCreatePerson={canCreatePerson}
              today={today}
            />

            {protocolPreview && (
              <FormField
                control={form.control}
                name="applyProtocol"
                render={({ field }) => (
                  <ProtocolPreview
                    protocols={protocolPreview.protocols}
                    facts={protocolFacts}
                    today={today}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            )}
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
