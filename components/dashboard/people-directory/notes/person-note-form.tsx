"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
} from "@/app/lib/actions/person-note.actions";
import { PersonNoteFormSchema } from "@/app/lib/zod-schemas/people-directory.schemas";
import { PersonNotePayload } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

type PersonNoteFormValues = z.infer<typeof PersonNoteFormSchema>;

interface Props {
  personId: string;
  onFormSubmit: () => void;
  note?: PersonNotePayload;
}

export const PersonNoteForm = ({ personId, onFormSubmit, note }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<PersonNoteFormValues>({
    resolver: standardSchemaResolver(PersonNoteFormSchema),
    defaultValues: note ? { content: note.content } : { content: "" },
  });

  const onSubmit = (values: PersonNoteFormValues) => {
    startSubmitTransition(async () => {
      const result = note
        ? await updatePersonNote(note.id, personId, values)
        : await createPersonNote(personId, values);

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