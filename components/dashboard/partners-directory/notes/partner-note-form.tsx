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
  createPartnerNote,
  updatePartnerNote,
  type PartnerNoteFormState,
} from "@/app/lib/actions/partner-note.actions";
import { PartnerNoteFormSchema } from "@/app/lib/zod-schemas/partners-directory.schemas";
import { PartnerNotePayload } from "@/app/lib/types";

const INITIAL_FORM_STATE: PartnerNoteFormState = {
  success: false,
  message: null,
  errors: {},
};

type PartnerNoteFormValues = z.infer<typeof PartnerNoteFormSchema>;

interface Props {
  partnerId: string;
  onFormSubmit: () => void; // close the dialog on success
  note?: PartnerNotePayload;
}

export const PartnerNoteForm = ({ partnerId, onFormSubmit, note }: Props) => {
  const action = note
    ? updatePartnerNote.bind(null, note.id, partnerId)
    : createPartnerNote.bind(null, partnerId);

  const [state, formAction, isPending] = useActionState<
    PartnerNoteFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<PartnerNoteFormValues>({
    resolver: zodResolver(PartnerNoteFormSchema),
    defaultValues: note
      ? { content: note.content }
      : { content: "" },
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
        form.setError(key as keyof PartnerNoteFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: PartnerNoteFormValues) => {
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