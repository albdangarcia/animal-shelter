"use client";

import { useTransition } from "react";
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
import type { BreedModel } from "@/prisma/generated/models/Breed";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import { createBreed, updateBreed } from "@/app/lib/actions/breeds-catalog.actions";
import { BreedFormSchema } from "@/app/lib/zod-schemas/taxonomy.schemas";
import { sizeOptions } from "@/components/dashboard/animals/table/animal-options";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";

type BreedFormValues = z.infer<typeof BreedFormSchema>;

// Sentinel for "Not specified" — Radix Select forbids an empty-string item
// value, so we map this back to "" (typicalSize = null) on change.
const NOT_SPECIFIED_VALUE = "__not_specified__";

interface Props {
  onFormSubmit: () => void;
  species: SpeciesModel[]; // active species, for the selector
  breed?: BreedModel;
}

export const BreedForm = ({ onFormSubmit, species, breed }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<BreedFormValues>({
    resolver: standardSchemaResolver(BreedFormSchema),
    defaultValues: breed
      ? {
          name: breed.name,
          speciesId: breed.speciesId,
          typicalSize: breed.typicalSize ?? "",
        }
      : { name: "", speciesId: "", typicalSize: "" },
  });

  const onSubmit = (values: BreedFormValues) => {
    startSubmitTransition(async () => {
      const result = breed
        ? await updateBreed(breed.id, values)
        : await createBreed(values);

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
          {/* Species */}
          <FormField
            control={form.control}
            name="speciesId"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="speciesId">Species</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="speciesId">
                      <SelectValue placeholder="Select a species" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {species.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="name">Name</FormLabel>
                <FormControl>
                  <Input id="name" placeholder="e.g. Labrador" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Typical Size */}
          <FormField
            control={form.control}
            name="typicalSize"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="typicalSize">Typical Adult Size</FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === NOT_SPECIFIED_VALUE ? "" : value)
                  }
                  value={field.value || NOT_SPECIFIED_VALUE}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="typicalSize">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NOT_SPECIFIED_VALUE}>
                      Not specified
                    </SelectItem>
                    {sizeOptions.map((option) => (
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
                {breed ? "Updating..." : "Creating..."}
              </>
            ) : breed ? (
              "Update Breed"
            ) : (
              "Create Breed"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};