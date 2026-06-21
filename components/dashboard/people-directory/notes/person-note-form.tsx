"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createPersonNote,
  updatePersonNote,
  type PersonNoteFormState,
} from "@/app/lib/actions/person-note.actions";
import { PersonNoteFormSchema } from "@/app/lib/zod-schemas/people-directory.schemas";
import { PersonNotePayload } from "@/app/lib/types";

const INITIAL_FORM_STATE: PersonNoteFormState = {
  success: false,
  message: null,
  errors: {},
};

type PersonNoteFormValues = z.infer<typeof PersonNoteFormSchema>;

interface Props {
  personId: string;
  onFormSubmit: () => void;
  note?: PersonNotePayload;
}

export const PersonNoteForm = ({ personId, onFormSubmit, note }: Props) => {
  const action = note
    ? updatePersonNote.bind(null, note.id, personId)
    : createPersonNote.bind(null, personId);

  const [state, formAction, isPending] = useActionState<
    PersonNoteFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<PersonNoteFormValues>({
    resolver: zodResolver(PersonNoteFormSchema),
    defaultValues: note ? { content: note.content } : { content: "" },
  });

  useEffect(() => {
    if (!state.message) {
      return;
    }

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors && Object.keys(state.errors).length > 0) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof PersonNoteFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: PersonNoteFormValues) => {
    const formData = new FormData();
    formData.append("content", data.content);

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
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