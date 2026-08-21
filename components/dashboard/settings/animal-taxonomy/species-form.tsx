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
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import {
  createSpecies,
  updateSpecies,
} from "@/app/lib/actions/species-catalog.actions";
import { SpeciesFormSchema } from "@/app/lib/zod-schemas/taxonomy.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";

type SpeciesFormValues = z.infer<typeof SpeciesFormSchema>;

interface Props {
  onFormSubmit: () => void;
  species?: SpeciesModel;
}

export const SpeciesForm = ({ onFormSubmit, species }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<SpeciesFormValues>({
    resolver: standardSchemaResolver(SpeciesFormSchema),
    defaultValues: species ? { name: species.name } : { name: "" },
  });

  const onSubmit = (values: SpeciesFormValues) => {
    startSubmitTransition(async () => {
      const result = species
        ? await updateSpecies(species.id, values)
        : await createSpecies(values);

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