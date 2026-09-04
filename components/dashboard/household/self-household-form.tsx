"use client";

import { updateMyHouseholdProfile } from "@/app/lib/actions/household-profile.actions";
import { useTransition } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { HouseholdFieldsSchema } from "@/app/lib/zod-schemas/household-profile.schemas";
import { HouseholdProfilePayload } from "@/app/lib/types";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  HouseholdFormFields,
  buildDefaultValues,
  type HouseholdProfileFormValues,
} from "./household-fields";

export const SelfHouseholdForm = ({
  householdProfile,
}: {
  householdProfile?: HouseholdProfilePayload | null;
}) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<HouseholdProfileFormValues>({
    resolver: standardSchemaResolver(HouseholdFieldsSchema),
    defaultValues: buildDefaultValues(householdProfile),
  });

  // The result is the return value of a function called right here, so it is
  // handled right here. No useActionState, no state to hold it, and no effect
  // to drain that state — which is what previously fired toast.error() on a
  // successful save, because the effect could only see `state.message` and had
  // no way to know it described a success.
  const onSubmit = (values: HouseholdProfileFormValues) => {
    startSubmitTransition(async () => {
      const result = await updateMyHouseholdProfile(values);

      if (result.ok) {
        toast.success(result.message);
        // Re-baseline so isDirty is accurate after a successful save.
        form.reset(values);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Household & Lifestyle</CardTitle>
            <CardDescription>
              This information helps us match you with the right animal and
              speeds up future adoption applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <HouseholdFormFields form={form} />
          </CardContent>
          <CardFooter className="flex justify-end space-x-4">
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Saving..." : "Save Household Info"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};
