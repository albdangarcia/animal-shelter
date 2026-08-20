"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { returnFromFoster } from "@/app/lib/actions/foster-placement.actions";
import { ReturnFromFosterSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { fosterReturnReasonOptions } from "@/app/lib/utils/enum-formatter";
import { UnitPickerLocation } from "@/app/lib/data/locations/unit-picker.data";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

type ReturnFromFosterFormValues = z.input<typeof ReturnFromFosterSchema>;

interface ReturnFromFosterFormProps {
  placement: {
    id: string;
    animal: { id: string; name: string };
    fosterProfile: { person: { name: string } };
    previousUnitId: string | null;
  };
  unitOptions: UnitPickerLocation[];
}

export function ReturnFromFosterForm({
  placement,
  unitOptions,
}: ReturnFromFosterFormProps) {
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  // Default to the previous unit's location, but only if that unit still
  // exists (it may have been deleted while the animal was fostered).
  const previousLocation = unitOptions.find((location) =>
    location.units.some((unit) => unit.id === placement.previousUnitId),
  );
  const [currentLocationId, setCurrentLocationId] = useState(
    previousLocation?.id ?? "",
  );

  const form = useForm<ReturnFromFosterFormValues>({
    resolver: standardSchemaResolver(ReturnFromFosterSchema),
    defaultValues: {
      placementId: placement.id,
      returnReason: undefined,
      returnNotes: "",
      unitId: previousLocation ? (placement.previousUnitId ?? "") : "",
    },
  });

  const onSubmit = (values: ReturnFromFosterFormValues) => {
    startSubmitTransition(async () => {
      const result = await returnFromFoster(values);

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

  const selectedLocation = unitOptions.find((l) => l.id === currentLocationId);

  const formatUnitOption = (unit: UnitPickerLocation["units"][number]) => {
    const hint = `${unit.name} · ${unit.occupancy}/${unit.capacity}`;
    return unit.occupancy >= unit.capacity ? `${hint} (full)` : hint;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Return From Foster</CardTitle>
            <CardDescription>
              Return {placement.animal.name} from{" "}
              {placement.fosterProfile.person.name} back into shelter care.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="returnReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Return Reason *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fosterReturnReasonOptions
                        .filter((option) => option.value !== "ADOPTED_BY_FOSTER")
                        .map((option) => (
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Location</Label>
                <Select
                  value={currentLocationId}
                  onValueChange={(value) => {
                    setCurrentLocationId(value);
                    form.setValue("unitId", "");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!currentLocationId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(selectedLocation?.units || []).map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {formatUnitOption(unit)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="returnNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any relevant notes about this return..."
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
            <Button asChild variant="outline" type="button" disabled={isPending}>
              <Link href={`/dashboard/animals/${placement.animal.id}`}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Returning..." : "Return From Foster"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
