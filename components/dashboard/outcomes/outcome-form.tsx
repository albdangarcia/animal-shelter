"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { OutcomeType } from "@/prisma/generated/enums";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
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
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";

type OutcomeFormData = z.infer<typeof OutcomeFormSchema>;

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
}

export function OutcomeForm({
  animal,
  application,
  outcome,
  partners,
  suggestedOwnerId,
  suggestedOwnerLabel,
}: OutcomeFormProps) {
  const isEditMode = !!outcome;

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  const isAdoptionOutcome = !!application;

  const filteredOutcomeTypeOptions = isAdoptionOutcome
    ? outcomeTypeOptions.filter((option) => option.value === "ADOPTION")
    : outcomeTypeOptions.filter((option) => option.value !== "ADOPTION");

  // Bind the appropriate action and IDs
  const action = isEditMode
    ? updateOutcome.bind(null, outcome.id)
    : createOutcome.bind(null, {
        animalId: animal.id,
        adoptionApplicationId: application?.id,
      });

  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_FORM_STATE,
  );

  const form = useForm<OutcomeFormData>({
    resolver: zodResolver(OutcomeFormSchema),
    defaultValues: {
      outcomeDate: outcome?.outcomeDate ?? new Date(),
      outcomeType:
        outcome?.type ?? (application ? "ADOPTION" : ("" as OutcomeType)),
      destinationPartnerId: outcome?.destinationPartnerId ?? "",
      ownerId: outcome?.ownerId ?? "",
      notes: outcome?.notes ?? "",
    },
  });

  const outcomeTypeValue = form.watch("outcomeType");

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }

    // If there are specific field errors, update the form fields.
    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof OutcomeFormData, {
          type: "server",
          message: value?.join(", "),
        });
      }
    }
  }, [state, form]);

  const handleFormSubmit = (data: OutcomeFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        // Handle Date object specifically
        if (value instanceof Date) {
          formData.append(key, value.toISOString());
        } else {
          formData.append(key, String(value));
        }
      }
    });
    startTransition(() => {
      formAction(formData);
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
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
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
                      defaultValue={field.value}
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
                        returnTo={returnTo}
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
