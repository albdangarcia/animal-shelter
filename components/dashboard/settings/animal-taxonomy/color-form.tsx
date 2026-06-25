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
import { Color } from "@prisma/client";
import {
  ColorFormState,
  createColor,
  updateColor,
} from "@/app/lib/actions/colors-catalog.actions";
import { ColorFormSchema } from "@/app/lib/zod-schemas/color.schemas";
import { toast } from "sonner";

const INITIAL_FORM_STATE: ColorFormState = {
  success: false,
  message: null,
  errors: {},
};

type ColorFormValues = z.infer<typeof ColorFormSchema>;

interface Props {
  onFormSubmit: () => void;
  color?: Color;
}

export const ColorForm = ({ onFormSubmit, color }: Props) => {
  const action = color ? updateColor.bind(null, color.id) : createColor;

  const [state, formAction, isPending] = useActionState<
    ColorFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<ColorFormValues>({
    resolver: zodResolver(ColorFormSchema),
    defaultValues: color ? { name: color.name } : { name: "" },
  });

  useEffect(() => {
    if (!state.message) {
      return;
    }

    if (state.success) {
      toast.success(state.message);
      onFormSubmit();
    } else if (state.errors) {
      toast.error(state.message || "Please check the form for errors.");
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof ColorFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: ColorFormValues) => {
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
                <Input id="name" placeholder="e.g. Brindle" {...field} />
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
                {color ? "Updating..." : "Creating..."}
              </>
            ) : color ? (
              "Update Color"
            ) : (
              "Create Color"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};