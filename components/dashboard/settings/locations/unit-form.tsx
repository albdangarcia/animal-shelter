"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import type { UnitModel } from "@/prisma/generated/models/Unit";
import { createUnit, updateUnit } from "@/app/lib/actions/locations.actions";
import { UnitFormSchema } from "@/app/lib/zod-schemas/location.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";
import { NumberInput } from "@/components/forms/number-input";

type UnitFormValues = z.infer<typeof UnitFormSchema>;

interface Props {
  onFormSubmit: () => void;
  locationId: string; // the parent location this unit belongs to
  unit?: UnitModel;
}

export const UnitForm = ({ onFormSubmit, locationId, unit }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<UnitFormValues>({
    resolver: standardSchemaResolver(UnitFormSchema),
    defaultValues: unit
      ? { name: unit.name, capacity: unit.capacity, locationId }
      : { name: "", capacity: 1, locationId },
  });

  // locationId is not a visible field — the unit keeps its parent location,
  // carried in defaultValues rather than appended at submit time.
  const onSubmit = (values: UnitFormValues) => {
    startSubmitTransition(async () => {
      const result = unit
        ? await updateUnit(unit.id, values)
        : await createUnit(values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4">
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="name">Name</FormLabel>
                <FormControl>
                  <Input id="name" placeholder="e.g. A-1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Capacity */}
          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="capacity">Capacity</FormLabel>
                <FormControl>
                  <NumberInput id="capacity" min={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {unit ? "Updating..." : "Creating..."}
              </>
            ) : unit ? (
              "Update Unit"
            ) : (
              "Create Unit"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
