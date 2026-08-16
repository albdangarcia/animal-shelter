"use client";

import { startTransition, useActionState, useEffect } from "react";
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
import {
  UnitFormState,
  createUnit,
  updateUnit,
} from "@/app/lib/actions/locations.actions";
import { UnitFormSchema } from "@/app/lib/zod-schemas/location.schemas";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { toast } from "sonner";

type UnitFormValues = z.infer<typeof UnitFormSchema>;

interface Props {
  onFormSubmit: () => void;
  locationId: string; // the parent location this unit belongs to
  unit?: UnitModel;
}

export const UnitForm = ({ onFormSubmit, locationId, unit }: Props) => {
  const action = unit ? updateUnit.bind(null, unit.id) : createUnit;

  const [state, formAction, isPending] = useActionState<
    UnitFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm({
    resolver: standardSchemaResolver(UnitFormSchema),
    defaultValues: unit
      ? { name: unit.name, capacity: unit.capacity, locationId }
      : { name: "", capacity: 1, locationId },
  });

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof UnitFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: UnitFormValues) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("capacity", String(data.capacity));
    // locationId is not a visible field — the unit keeps its parent location.
    formData.append("locationId", locationId);

    startTransition(() => {
      formAction(formData);
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
            render={({ field }) => {
              // Keep the number input controlled as a string, parsing to an int
              // on change (mirrors weightKg/heightCm in the animal intake form).
              const value =
                field.value === undefined || field.value === ""
                  ? ""
                  : String(field.value);

              return (
                <FormItem>
                  <FormLabel htmlFor="capacity">Capacity</FormLabel>
                  <FormControl>
                    <Input
                      id="capacity"
                      type="number"
                      min="1"
                      {...field}
                      value={value}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? "" : parseInt(val, 10));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
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
