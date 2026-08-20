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
import { ColorModel } from "@/prisma/generated/models/Color";
import {
  createColor,
  updateColor,
} from "@/app/lib/actions/colors-catalog.actions";
import { ColorFormSchema } from "@/app/lib/zod-schemas/color.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";

type ColorFormValues = z.infer<typeof ColorFormSchema>;

interface Props {
  onFormSubmit: () => void;
  color?: ColorModel;
}

export const ColorForm = ({ onFormSubmit, color }: Props) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<ColorFormValues>({
    resolver: standardSchemaResolver(ColorFormSchema),
    defaultValues: color ? { name: color.name } : { name: "" },
  });

  const onSubmit = (values: ColorFormValues) => {
    startSubmitTransition(async () => {
      const result = color
        ? await updateColor(color.id, values)
        : await createColor(values);

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