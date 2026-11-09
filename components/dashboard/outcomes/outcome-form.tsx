"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch, type DefaultValues } from "react-hook-form";
import { toast } from "sonner";
import {
  AdoptionApplicationPayload,
  OutcomePayload,
  PartnerPayload,
} from "@/app/lib/types";
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
import { DayField } from "@/components/forms/day-field";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PersonPicker } from "@/components/common/person-picker";
import { outcomeTypeOptions } from "@/app/lib/utils/enum-formatter";
import {
  createOutcome,
  updateOutcome,
} from "@/app/lib/actions/outcome.actions";
import {
  OutcomeFormSchema,
  CreateOutcomeFormSchema,
  type OutcomeFormInput,
} from "@/app/lib/zod-schemas/outcome.schema";
import { OutcomeMedicalFields, emptyOutcomeMedical } from "./outcome-medical-fields";
import type { OutcomeMedicalDetailsInput } from "@/app/lib/zod-schemas/outcome-medical.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

export type OutcomeFormValues = OutcomeFormInput;

interface AnimalForOutcome {
  id: string;
  name: string;
}

interface OutcomeFormProps {
  animal: AnimalForOutcome;
  application?: AdoptionApplicationPayload; // Optional, for internal adoptions
  outcome?: OutcomePayload; // For edit mode
  /**
   * Edit mode: this outcome ended a foster placement, whose end day is the
   * outcome's and moves with it.
   */
  endedFosterPlacement?: boolean;
  partners: PartnerPayload[]; // For the 'Transfer' option
  suggestedOwnerId?: string; // For the 'Return to Owner' option
  suggestedOwnerLabel?: string;
  canCreatePerson?: boolean;
  canManageOutcome: boolean;
  canManageMedical?: boolean;
  hasMedicalDetails?: boolean;
  medical?: OutcomeMedicalDetailsInput;
  medicalPeople?: { authorizer?: { id: string; name: string }; performer?: { id: string; name: string } };
  clinics?: { id: string; name: string }[];
  /**
   * Today, on the shelter's calendar, resolved on the server. The picker starts
   * on it, and it is the same day the outcome would be filed under — a
   * `new Date()` here would be re-resolved in the viewer's zone, so the server
   * render and the browser's could disagree by a day.
   */
  today: CalendarDay;
}

const buildDefaultValues = (
  today: CalendarDay,
  outcome?: OutcomePayload,
  application?: AdoptionApplicationPayload,
): DefaultValues<OutcomeFormValues> => ({
  // The day the picker starts on: today on the shelter's calendar, which is the
  // day an outcome recorded now is filed under.
  outcomeDate: outcome?.outcomeDate ?? today,
  // Undefined rather than `"" as OutcomeType` when there is nothing to
  // preselect: the field is legitimately unset until the user picks, and the
  // cast claimed an empty string was a valid enum member.
  outcomeType: outcome?.type ?? (application ? "ADOPTION" : undefined),
  destinationPartnerId: outcome?.destinationPartnerId ?? "",
  ownerId: outcome?.ownerId ?? "",
  notes: outcome?.notes ?? "",
});

export function OutcomeForm({
  animal,
  application,
  outcome,
  endedFosterPlacement,
  partners,
  suggestedOwnerId,
  suggestedOwnerLabel,
  canCreatePerson,
  today, canManageOutcome, canManageMedical = false, hasMedicalDetails = false, medical, medicalPeople, clinics = [],
}: OutcomeFormProps) {
  const isEditMode = !!outcome;
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const isAdoptionOutcome = !!application;

  const filteredOutcomeTypeOptions = isAdoptionOutcome
    ? outcomeTypeOptions.filter((option) => option.value === "ADOPTION")
    : outcomeTypeOptions.filter((option) => option.value !== "ADOPTION" && (isEditMode || canManageMedical || !["DECEASED", "EUTHANIZED"].includes(option.value)));

  const form = useForm<OutcomeFormValues>({
    resolver: standardSchemaResolver(isEditMode ? OutcomeFormSchema : CreateOutcomeFormSchema),
    defaultValues: { ...buildDefaultValues(today, outcome, application), medical: canManageMedical ? medical : undefined },
  });

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize safely, so it skips compiling the whole component.
  const outcomeTypeValue = useWatch({
    control: form.control,
    name: "outcomeType",
  });

  const medicalValue = useWatch({ control: form.control, name: "medical" });

  const handleFormSubmit = (values: OutcomeFormValues) => {
    startSubmitTransition(async () => {
      const result = isEditMode
        ? await updateOutcome(outcome.id, values)
        : await createOutcome(
            {
              animalId: animal.id,
              adoptionApplicationId: application?.id,
            },
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
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-8"
      >
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>
              {isEditMode ? "Edit Outcome" : "Process Animal Outcome"}
            </CardTitle>
            <CardDescription>
              {isEditMode
                ? `Update the outcome details for ${animal.name}.`
                : `Finalize the journey for ${animal.name}. This action will archive the animal's record.`}
            </CardDescription>
          </CardHeader>

          <CardContent><fieldset disabled={!canManageOutcome || isPending} className="space-y-6 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="outcomeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Outcome Type</FormLabel>
                    {/* Was both defaultValue and value, which makes the Select
                        uncontrolled on first render and ignores form.reset(). */}
                    <Select
                      name={field.name}
                      onValueChange={(type) => {
                        field.onChange(type);
                        form.reset({ ...form.getValues(), outcomeType: type as OutcomeFormInput["outcomeType"], medical: type === "DECEASED" || type === "EUTHANIZED" ? emptyOutcomeMedical(type) : undefined }, { keepDefaultValues: true });
                      }}
                      value={field.value ?? ""}
                      disabled={isAdoptionOutcome || isEditMode}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredOutcomeTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isEditMode && (
                      <FormDescription>
                        A wrong type is fixed by reversing this outcome and
                        recording the right one.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DayField
                control={form.control}
                name="outcomeDate"
                label="Date of Outcome"
                className="flex flex-col"
                triggerClassName="pl-3"
                required
                // No future days: an outcome is recorded after it happens. The
                // grid works in local dates, so the shelter's day is read as
                // one to compare against.
                disabledDates={(date) => date > parseISO(today) || (hasMedicalDetails && !canManageMedical)}
                description={
                  hasMedicalDetails && !canManageMedical
                    ? "Changing this date also changes the medical record and requires medical management."
                    : isEditMode && endedFosterPlacement
                    ? "This outcome ended a foster placement. Changing the date moves the placement's end day with it."
                    : undefined
                }
              />
            </div>

            {outcomeTypeValue === "TRANSFER_OUT" && (
              <FormField
                control={form.control}
                name="destinationPartnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Destination Partner</FormLabel>
                    <Select
                      name={field.name}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a partner shelter or rescue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Hidden rather than unmounted while another type is chosen. The
                picker knows the chosen person's name only from its own state,
                so a remount would show an empty search box while the field
                still holds the person, and a save would send someone nobody
                can see. */}
            <div hidden={outcomeTypeValue !== "RETURN_TO_OWNER"}>
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Owner</FormLabel>
                    <FormControl>
                      <PersonPicker
                        value={field.value || null}
                        onChange={(id) => field.onChange(id ?? "")}
                        initialSelection={outcome?.owner ?? undefined}
                        suggestedPersonId={suggestedOwnerId}
                        suggestedPersonLabel={suggestedOwnerLabel}
                        canCreatePerson={canCreatePerson}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(outcomeTypeValue === "EUTHANIZED" || outcomeTypeValue === "DECEASED") && <>
              {!hasMedicalDetails && isEditMode && <p>Medical details not recorded</p>}
              {canManageMedical && <>
                {!medicalValue && <Button type="button" variant="outline" onClick={() => form.reset({ ...form.getValues(), medical: emptyOutcomeMedical(outcomeTypeValue) }, { keepDefaultValues: true })}>Add medical details</Button>}
                <OutcomeMedicalFields key={outcomeTypeValue} form={form} clinics={clinics} people={medicalPeople} />
              </>}
            </>}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any relevant notes about this outcome..."
                      className="resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset></CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={`/dashboard/animals/${animal.id}`}>Cancel</Link>
            </Button>
            {canManageOutcome && <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Processing..."
                : isEditMode
                  ? "Update Outcome"
                  : "Process Outcome"}
            </Button>}
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
