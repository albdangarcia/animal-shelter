"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
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
import type { LocationModel } from "@/prisma/generated/models/Location";
import type { LocationType } from "@/prisma/generated/enums";
import {
  createLocation,
  updateLocation,
} from "@/app/lib/actions/locations.actions";
import { LocationFormSchema } from "@/app/lib/zod-schemas/location.schemas";
import { locationTypeOptions } from "@/app/lib/utils/enum-formatter";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";

type LocationFormValues = z.infer<typeof LocationFormSchema>;

interface Props {
  onFormSubmit: () => void;
  location?: LocationModel;
}

export const LocationForm = ({ onFormSubmit, location }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<LocationFormValues>({
    resolver: standardSchemaResolver(LocationFormSchema),
    defaultValues: location
      ? { name: location.name, type: location.type }
      : ({ name: "", type: "" as LocationType } as DefaultValues<LocationFormValues>),
  });

  const onSubmit = (values: LocationFormValues) => {
    startSubmitTransition(async () => {
      const result = location
        ? await updateLocation(location.id, values)
        : await createLocation(values);

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
                  value={field.value ?? ""}
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
