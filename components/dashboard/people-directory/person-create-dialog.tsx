"use client";

import {
  createPerson,
  type DuplicateCandidate,
} from "@/app/lib/actions/person.actions";
import type { PersonPickerOption } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { StaffPersonFormSchema } from "@/app/lib/zod-schemas/people-directory.schemas";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2, TriangleAlert } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { PersonFormFields } from "./person-form-fields";
import type { PersonFormValues } from "./person-form";

export interface PersonCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (person: PersonPickerOption) => void;
}

const defaultValues: DefaultValues<PersonFormValues> = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
};

export function PersonCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: PersonCreateDialogProps) {
  const [isPending, startSubmitTransition] = useTransition();
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [lastValues, setLastValues] = useState<PersonFormValues | null>(null);
  const form = useForm<PersonFormValues>({
    resolver: standardSchemaResolver(StaffPersonFormSchema),
    defaultValues,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset(defaultValues);
      setDuplicate(null);
      setLastValues(null);
    }
    onOpenChange(nextOpen);
  };

  const submit = (values: PersonFormValues, confirmDuplicate: boolean) => {
    setDuplicate(null);
    setLastValues(values);

    startSubmitTransition(async () => {
      const result = await createPerson(null, confirmDuplicate, values);

      if (result.ok) {
        onCreated(result.person);
        toast.success(result.message);
        handleOpenChange(false);
        return;
      }

      if ("reason" in result) {
        setDuplicate(result.duplicate);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const onSubmit = (values: PersonFormValues) => submit(values, false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // The dialog is rendered in a host form's React tree. Stop the event
    // before RHF dispatches it so the host form cannot submit as well.
    event.stopPropagation();
    void form.handleSubmit(onSubmit)(event);
  };

  const handleUseExisting = () => {
    if (!duplicate) return;
    onCreated({
      id: duplicate.id,
      name: duplicate.name,
      email: duplicate.email ?? null,
      phone: duplicate.phone ?? null,
    });
    handleOpenChange(false);
  };

  const handleConfirmDuplicate = () => {
    if (!lastValues) return;
    submit(lastValues, true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Person</DialogTitle>
          <DialogDescription>
            Register a new contact record — e.g., a walk-in contact or partner.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-8">
            {duplicate && (
              <Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">
                  Possible duplicate person
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-400">
                  {duplicate.matchedOn === "phone" ? (
                    <span>
                      This phone matches an existing contact: {duplicate.name}
                      {duplicate.phone ? ` (${duplicate.phone})` : ""}.
                    </span>
                  ) : (
                    <span>
                      A person with this email already exists: {duplicate.name}.
                    </span>
                  )}
                  {duplicate.matchedOn === "email" && (
                    <span>
                      This email is already in use by another person — it
                      can&apos;t be saved here too.
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 font-semibold text-amber-800 underline dark:text-amber-300"
                      onClick={handleUseExisting}
                    >
                      Use them instead
                    </Button>
                    {duplicate.matchedOn === "phone" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={handleConfirmDuplicate}
                      >
                        Continue anyway
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <PersonFormFields form={form} mode="staff" />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? "Creating..." : "Create Person"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default PersonCreateDialog;
