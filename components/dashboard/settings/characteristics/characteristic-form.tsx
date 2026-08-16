"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { CharacteristicCategory } from "@/prisma/generated/enums";
import type { CharacteristicModel } from "@/prisma/generated/models/Characteristic";
import {
  CharacteristicFormState,
  createCharacteristic,
  updateCharacteristic,
} from "@/app/lib/actions/characteristics-catalog.actions";
import { CharacteristicFormSchema } from "@/app/lib/zod-schemas/characteristic.schemas";
import { CATEGORIES, CATEGORY_KEYS } from "@/app/lib/constants/characteristic-categories";
import { toast } from "sonner";

const INITIAL_FORM_STATE: CharacteristicFormState = {
  success: false,
  message: null,
  errors: {},
};

type CharacteristicFormValues = z.infer<typeof CharacteristicFormSchema>;

interface Props {
  onFormSubmit: () => void; // To close the dialog on success
  characteristic?: CharacteristicModel;
}

export const CharacteristicForm = ({ onFormSubmit, characteristic }: Props) => {
  const action = characteristic
    ? updateCharacteristic.bind(null, characteristic.id)
    : createCharacteristic;

  const [state, formAction, isPending] = useActionState<
    CharacteristicFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<CharacteristicFormValues>({
    resolver: zodResolver(CharacteristicFormSchema),
    defaultValues: characteristic
      ? {
        name: characteristic.name,
        category: characteristic.category,
      }
      : {
        name: "",
        category: CharacteristicCategory.BEHAVIOR,
      },
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
        form.setError(key as keyof CharacteristicFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: CharacteristicFormValues) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("category", data.category);

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4">
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="name">Name</FormLabel>
                <FormControl>
                  <Input
                    id="name"
                    placeholder="e.g. Good with kids"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
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
                    {CATEGORY_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {CATEGORIES[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {characteristic ? "Updating..." : "Creating..."}
              </>
            ) : characteristic ? (
              "Update Characteristic"
            ) : (
              "Create Characteristic"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};