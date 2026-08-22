"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PersonPicker } from "@/components/common/person-picker";
import { format } from "date-fns";
import { outcomeTypeOptions } from "@/app/lib/utils/enum-formatter";
import {
  createOutcome,
  updateOutcome,
} from "@/app/lib/actions/outcome.actions";
import { cn } from "@/lib/utils";
import {
  OutcomeFormSchema,
  type OutcomeFormInput,
} from "@/app/lib/zod-schemas/outcome.schema";
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
  partners: PartnerPayload[]; // For the 'Transfer' option
  suggestedOwnerId?: string; // For the 'Return to Owner' option
  suggestedOwnerLabel?: string;
  canCreatePerson?: boolean;
}

const buildDefaultValues = (
  outcome?: OutcomePayload,
  application?: AdoptionApplicationPayload,
): DefaultValues<OutcomeFormValues> => ({
  outcomeDate: outcome?.outcomeDate ?? new Date(),
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
  partners,
  suggestedOwnerId,
  suggestedOwnerLabel,
  canCreatePerson,
}: OutcomeFormProps) {
  const isEditMode = !!outcome;
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const isAdoptionOutcome = !!application;

  const filteredOutcomeTypeOptions = isAdoptionOutcome
    ? outcomeTypeOptions.filter((option) => option.value === "ADOPTION")
    : outcomeTypeOptions.filter((option) => option.value !== "ADOPTION");

  const form = useForm<OutcomeFormValues>({
    resolver: standardSchemaResolver(OutcomeFormSchema),
    defaultValues: buildDefaultValues(outcome, application),
  });

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize safely, so it skips compiling the whole component.
  const outcomeTypeValue = useWatch({
    control: form.control,
    name: "outcomeType",
  });

  const handleFormSubmit = (values: OutcomeFormValues) => {
    startSubmitTransition(async () => {
      // outcomeDate travels as a real Date — server actions serialize it, so
      // the toISOString() round-trip and the `new Date(... as string)` cast on
      // the other end are both gone.
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

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="outcomeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Outcome Type *</FormLabel>
                    {/* Was both defaultValue and value, which makes the Select
                        uncontrolled on first render and ignores form.reset(). */}
                    <Select
                      onValueChange={field.onChange}
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outcomeDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of Outcome *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(date);
                            }
                          }}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(23, 59, 59, 999);
                            return date > today;
                          }}
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {outcomeTypeValue === "TRANSFER_OUT" && (
              <FormField
                control={form.control}
                name="destinationPartnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Partner *</FormLabel>
                    <Select
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

            {outcomeTypeValue === "RETURN_TO_OWNER" && (
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner *</FormLabel>
                    <FormControl>
                      <PersonPicker
                        value={field.value || null}
                        onChange={(id) => field.onChange(id ?? "")}
                        suggestedPersonId={suggestedOwnerId}
                        suggestedPersonLabel={suggestedOwnerLabel}
                        canCreatePerson={canCreatePerson}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
              {isPending
                ? isEditMode
                  ? "Updating..."
                  : "Processing..."
                : isEditMode
                  ? "Update Outcome"
                  : "Process Outcome"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
