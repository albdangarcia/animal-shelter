"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { noteCategoryOptions } from "@/app/lib/utils/enum-formatter";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { NoteCategory } from "@/prisma/generated/enums";
import {
  createAnimalNote,
  updateAnimalNote,
} from "@/app/lib/actions/animal-note.actions";
import { FetchAnimalNotePayload } from "@/app/lib/data/animals/animal-note.data";
import { NoteFormSchema } from "@/app/lib/zod-schemas/animal.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";

type NoteFormValues = z.infer<typeof NoteFormSchema>;

interface Props {
  animalId: string;
  onFormSubmit: () => void; // To close the dialog on success
  note?: FetchAnimalNotePayload;
}

export const NoteForm = ({ animalId, onFormSubmit, note }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<NoteFormValues>({
    resolver: standardSchemaResolver(NoteFormSchema),
    defaultValues: note
      ? {
          category: note.category,
          content: note.content,
        }
      : {
          category: NoteCategory.BEHAVIORAL,
          content: "",
        },
  });

  const onSubmit = (values: NoteFormValues) => {
    startSubmitTransition(async () => {
      const result = note
        ? await updateAnimalNote(note.id, animalId, values)
        : await createAnimalNote(animalId, values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit(); // Close the dialog
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Category */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel htmlFor="category">Category</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {noteCategoryOptions.map((option) => (
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

          {/* Content */}
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="col-span-full">
                <FormLabel>Content</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Provide a detailed description of the note..."
                    {...field}
                  />
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
                {note ? "Updating..." : "Creating..."}
              </>
            ) : note ? (
              "Update Note"
            ) : (
              "Create Note"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
