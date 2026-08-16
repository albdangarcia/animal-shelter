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
import type { BreedModel } from "@/prisma/generated/models/Breed";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import {
  BreedFormState,
  createBreed,
  updateBreed,
} from "@/app/lib/actions/breeds-catalog.actions";
import { BreedFormSchema } from "@/app/lib/zod-schemas/taxonomy.schemas";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { toast } from "sonner";

type BreedFormValues = z.infer<typeof BreedFormSchema>;

interface Props {
  onFormSubmit: () => void;
  species: SpeciesModel[]; // active species, for the selector
  breed?: BreedModel;
}

export const BreedForm = ({ onFormSubmit, species, breed }: Props) => {
  const action = breed ? updateBreed.bind(null, breed.id) : createBreed;

  const [state, formAction, isPending] = useActionState<
    BreedFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm({
    resolver: standardSchemaResolver(BreedFormSchema),
    defaultValues: breed
      ? { name: breed.name, speciesId: breed.speciesId }
      : { name: "", speciesId: "" },
  });

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof BreedFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: BreedFormValues) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("speciesId", data.speciesId);

    startTransition(() => {
      formAction(formData);
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
                  defaultValue={field.value}
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