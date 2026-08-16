"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  AnimalNoteFormState,
  createAnimalNote,
  updateAnimalNote,
} from "@/app/lib/actions/animal-note.actions";
import { FetchAnimalNotePayload } from "@/app/lib/data/animals/animal-note.data";
import { NoteFormSchema } from "@/app/lib/zod-schemas/animal.schemas";
import { toast } from "sonner";

const INITIAL_FORM_STATE: AnimalNoteFormState = {
  success: false,
  message: null,
  errors: {},
};

type NoteFormValues = z.infer<typeof NoteFormSchema>;

interface Props {
  animalId: string;
  onFormSubmit: () => void; // To close the dialog on success
  note?: FetchAnimalNotePayload;
}

export const NoteForm = ({ animalId, onFormSubmit, note }: Props) => {
  const action = note
    ? updateAnimalNote.bind(null, note.id, animalId)
    : createAnimalNote.bind(null, animalId);

  const [state, formAction, isPending] = useActionState<
    AnimalNoteFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(NoteFormSchema),
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

  useEffect(() => {
    if (!state.message) {
      return;
    }

    // If the action was successful, show a success toast and close the form.
    if (state.success) {
      toast.success(state.message);
      onFormSubmit(); // Close the dialog
    }
    // If it failed and there are specific field errors, set them on the form.
    else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof NoteFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    }
    // Handle other general errors (e.g., database, invalid ID)
    else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: NoteFormValues) => {
    const formData = new FormData();

    formData.append("category", data.category);
    formData.append("content", data.content);

    startTransition(() => {
      formAction(formData);
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
                  defaultValue={field.value}
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
