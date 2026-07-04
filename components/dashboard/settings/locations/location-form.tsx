"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Location, LocationType } from "@prisma/client";
import {
  LocationFormState,
  createLocation,
  updateLocation,
} from "@/app/lib/actions/locations.actions";
import { LocationFormSchema } from "@/app/lib/zod-schemas/location.schemas";
import { locationTypeOptions } from "@/app/lib/utils/enum-formatter";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { toast } from "sonner";

type LocationFormValues = z.infer<typeof LocationFormSchema>;

interface Props {
  onFormSubmit: () => void;
  location?: Location;
}

export const LocationForm = ({ onFormSubmit, location }: Props) => {
  const action = location
    ? updateLocation.bind(null, location.id)
    : createLocation;

  const [state, formAction, isPending] = useActionState<
    LocationFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm({
    resolver: standardSchemaResolver(LocationFormSchema),
    defaultValues: location
      ? { name: location.name, type: location.type }
      : { name: "", type: "" as LocationType },
  });

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof LocationFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: LocationFormValues) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("type", data.type);

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
                  <Input id="name" placeholder="e.g. Main Kennel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Type */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="type">Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="type">
                      <SelectValue placeholder="Select a location type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {locationTypeOptions.map((option) => (
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
                {location ? "Updating..." : "Creating..."}
              </>
            ) : location ? (
              "Update Location"
            ) : (
              "Create Location"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
