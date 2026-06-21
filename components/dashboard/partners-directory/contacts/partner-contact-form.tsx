"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  addPartnerContact,
  updatePartnerContact,
  type PartnerContactFormState,
} from "@/app/lib/actions/partner-contact.actions";
import { PartnerContactFormSchema } from "@/app/lib/zod-schemas/partners-directory.schemas";
import { PartnerContactsPayload, LinkablePersonPayload } from "@/app/lib/types";
import { PersonPicker, type SelectedPerson } from "./person-picker";

const INITIAL_FORM_STATE: PartnerContactFormState = {
  success: false,
  message: null,
  errors: {},
};

type PartnerContactFormValues = z.infer<typeof PartnerContactFormSchema>;

interface Props {
  partnerId: string;
  people: LinkablePersonPayload[]; // preloaded list for the picker
  onFormSubmit: () => void; // close the dialog on success
  contact?: PartnerContactsPayload; // present = edit mode
}

export const PartnerContactForm = ({
  partnerId,
  people,
  onFormSubmit,
  contact,
}: Props) => {
  const isEditMode = !!contact;

  // In edit mode the person is locked; seed the picker's display value.
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(
    contact
      ? {
          id: contact.person.id,
          name: contact.person.name,
          isDeactivatedContactHere: false,
        }
      : null,
  );

  const action = isEditMode
    ? updatePartnerContact.bind(null, contact.id, partnerId)
    : addPartnerContact.bind(null, partnerId);

  const [state, formAction, isPending] = useActionState<
    PartnerContactFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm<PartnerContactFormValues>({
    resolver: zodResolver(PartnerContactFormSchema),
    defaultValues: contact
      ? {
          personId: contact.person.id,
          role: contact.role || "",
          isPrimary: contact.isPrimary,
          isActive: contact.isActive,
        }
      : {
          personId: "",
          role: "",
          isPrimary: false,
          isActive: true,
        },
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
        form.setError(key as keyof PartnerContactFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  // Keep the RHF personId field in sync with the picker's selection.
  const handlePersonChange = (person: SelectedPerson | null) => {
    setSelectedPerson(person);
    form.setValue("personId", person?.id ?? "", {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const onSubmit = (data: PartnerContactFormValues) => {
    const formData = new FormData();
    formData.append("personId", data.personId);
    if (data.role) {
      formData.append("role", data.role);
    }
    // Checkboxes: append only when true (action reads "present = true").
    if (data.isPrimary) {
      formData.append("isPrimary", "on");
    }
    if (data.isActive) {
      formData.append("isActive", "on");
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Person picker (locked in edit mode) */}
        <FormField
          control={form.control}
          name="personId"
          render={() => (
            <FormItem>
              <FormLabel>Person</FormLabel>
              <PersonPicker
                people={people}
                value={selectedPerson}
                onChange={handlePersonChange}
                disabled={isEditMode}
              />
              {isEditMode ? (
                <FormDescription>
                  The linked person can&apos;t be changed. Remove this contact
                  and add another to link a different person.
                </FormDescription>
              ) : selectedPerson?.isDeactivatedContactHere ? (
                <FormDescription>
                  This person was previously a contact here. Adding them will
                  reactivate that link.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Role */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Intake Coordinator" {...field} />
              </FormControl>
              <FormDescription>
                Their role at this partner (optional).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Primary */}
        <FormField
          control={form.control}
          name="isPrimary"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Primary contact</FormLabel>
                <FormDescription>
                  The main point of contact. Setting this unsets any existing
                  primary.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Active */}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Uncheck to keep the link for history without it being a
                  current contact.
                </FormDescription>
              </div>
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
                {isEditMode ? "Updating..." : "Adding..."}
              </>
            ) : isEditMode ? (
              "Update Contact"
            ) : (
              "Add Contact"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};