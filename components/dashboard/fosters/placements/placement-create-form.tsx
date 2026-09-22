"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { parseISO } from "date-fns";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DayField } from "@/components/forms/day-field";
import { createFosterPlacement } from "@/app/lib/actions/foster-placement.actions";
import { createFosterPlacementSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { type CalendarDay } from "@/app/lib/utils/shelter-day";
import { fosterPlacementTypeOptions } from "@/app/lib/utils/enum-formatter";
import {
  FosterPickerOption,
  FosterableAnimalOption,
} from "@/app/lib/data/fosters/fosters.data";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { AnimalCombobox } from "./animal-combobox";

// The INPUT side: while the form is being filled in, the expected return date
// is still the plain `yyyy-MM-dd` string the picker writes.
type PlacementCreateFormValues = z.input<
  ReturnType<typeof createFosterPlacementSchema>
>;

interface PlacementCreateFormProps {
  // Exactly one side is "fixed" (the entry point) — the other is chosen from
  // the picker options passed in.
  fixedAnimal?: { id: string; name: string };
  fixedFoster?: { id: string; personName: string };
  fosterOptions?: FosterPickerOption[];
  animalOptions?: FosterableAnimalOption[];
  /**
   * Today, on the shelter's calendar, resolved on the server and handed down.
   * The browser is not told the shelter's timezone, so it cannot work this out
   * for itself. The action re-checks the same rule against the day it resolves
   * itself, and that is the check that decides.
   */
  today: CalendarDay;
}

export function PlacementCreateForm({
  fixedAnimal,
  fixedFoster,
  fosterOptions = [],
  animalOptions = [],
  today,
}: PlacementCreateFormProps) {
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const cancelHref = fixedAnimal
    ? `/dashboard/animals/${fixedAnimal.id}`
    : "/dashboard/fosters";

  const form = useForm<PlacementCreateFormValues>({
    resolver: standardSchemaResolver(createFosterPlacementSchema(today)),
    defaultValues: {
      animalId: fixedAnimal?.id ?? "",
      fosterProfileId: fixedFoster?.id ?? "",
      type: undefined,
      expectedEndDate: undefined,
      notes: "",
    },
  });

  const onSubmit = (values: PlacementCreateFormValues) => {
    startSubmitTransition(async () => {
      const result = await createFosterPlacement(values);

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
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Place Animal With Foster</CardTitle>
            <CardDescription>
              {fixedAnimal
                ? `Choose an active foster with capacity for ${fixedAnimal.name}.`
                : fixedFoster
                  ? `Choose an in-care animal to place with ${fixedFoster.personName}.`
                  : "Choose an animal and a foster."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {fixedAnimal ? (
              <div className="grid gap-2">
                <Label>Animal</Label>
                <div className="rounded-md border px-3 py-2 text-sm">
                  {fixedAnimal.name}
                </div>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="animalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Animal *</FormLabel>
                    <FormControl>
                      <AnimalCombobox
                        options={animalOptions}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    {animalOptions.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        No in-care animals are currently eligible for fostering.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {fixedFoster ? (
              <div className="grid gap-2">
                <Label>Foster</Label>
                <div className="rounded-md border px-3 py-2 text-sm">
                  {fixedFoster.personName}
                </div>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="fosterProfileId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foster *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an active foster with capacity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fosterOptions.map((foster) => (
                          <SelectItem key={foster.id} value={foster.id}>
                            {foster.personName} · {foster.openPlacementsCount}/
                            {foster.maxAnimals}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fosterOptions.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        No active fosters currently have capacity.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Placement Type *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a placement type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fosterPlacementTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value === "FOSTER_TO_ADOPT" && (
                    <p className="text-muted-foreground text-sm">
                      The animal&apos;s listing will move to Pending Adoption
                      while this placement is open.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DayField
              control={form.control}
              name="expectedEndDate"
              label="Expected Return Date"
              className="flex flex-col"
              triggerClassName="flex-1 justify-start"
              placeholder="No expected date"
              iconPosition="leading"
              clearable
              // The same boundary the schema and the overdue badge use, so the
              // picker can't offer a day the server would reject. The grid
              // works in local dates, so the shelter's day is read as one.
              disabledDates={(date) => date < parseISO(today)}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any relevant notes about this placement..."
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
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Placing..." : "Place in Foster"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
