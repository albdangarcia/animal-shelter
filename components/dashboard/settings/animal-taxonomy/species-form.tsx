"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import {
  SpeciesFormState,
  createSpecies,
  updateSpecies,
} from "@/app/lib/actions/species-catalog.actions";
import { SpeciesFormSchema } from "@/app/lib/zod-schemas/taxonomy.schemas";
import { toast } from "sonner";

const INITIAL_FORM_STATE: SpeciesFormState = {
  success: false,
  message: null,
  errors: {},
};

type SpeciesFormValues = z.infer<typeof SpeciesFormSchema>;

interface Props {
  onFormSubmit: () => void;
  species?: SpeciesModel;
}

export const SpeciesForm = ({ onFormSubmit, species }: Props) => {
  const action = species ? updateSpecies.bind(null, species.id) : createSpecies;

  const [state, formAction, isPending] = useActionState<
    SpeciesFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<SpeciesFormValues>({
    resolver: zodResolver(SpeciesFormSchema),
    defaultValues: species ? { name: species.name } : { name: "" },
  });

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof SpeciesFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: SpeciesFormValues) => {
    const formData = new FormData();
    formData.append("name", data.name);

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="name">Name</FormLabel>
              <FormControl>
                <Input id="name" placeholder="e.g. Dog" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                {species ? "Updating..." : "Creating..."}
              </>
            ) : species ? (
              "Update Species"
            ) : (
              "Create Species"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};