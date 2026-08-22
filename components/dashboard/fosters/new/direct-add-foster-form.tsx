"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PersonPicker } from "@/components/common/person-picker";
import { FosterCapabilityFormFields } from "@/components/dashboard/my-foster-application/foster-capability-form-fields";
import { createFosterProfileDirect } from "@/app/lib/actions/foster-application.actions";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  CreateFosterProfileSchema,
  FosterApplicationFormSchema,
} from "@/app/lib/zod-schemas/foster.schemas";

type DirectAddFosterFormValues = z.input<typeof CreateFosterProfileSchema>;

// FosterCapabilityFormFields is typed against the full foster application
// form (household + applicant + capability fields). This form only carries
// the capability subset, so the shared component is reused via a cast —
// same convention as MyFosterApplicationForm casting the other direction for
// HouseholdFormFields.
type FosterApplicationFormValues = z.input<typeof FosterApplicationFormSchema>;

interface DirectAddFosterFormProps {
  species: { id: string; name: string }[];
  suggestedPersonId?: string;
  suggestedPersonLabel?: string;
  returnTo?: string;
  canCreatePerson?: boolean;
}

export function DirectAddFosterForm({
  species,
  suggestedPersonId,
  suggestedPersonLabel,
  returnTo,
  canCreatePerson,
}: DirectAddFosterFormProps) {
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const form = useForm<DirectAddFosterFormValues>({
    resolver: standardSchemaResolver(CreateFosterProfileSchema),
    defaultValues: {
      personId: "",
      speciesIds: [],
      maxAnimals: 1,
      hasQuarantineSpace: undefined,
      canGiveOralMeds: undefined,
      canBottleFeed: undefined,
      canTransport: undefined,
      acceptsMedical: undefined,
      acceptsHospice: undefined,
      availabilityNotes: "",
    },
  });

  // speciesIds goes over as a real string[] instead of being appended one
  // entry at a time to work around FormData's repeated-key handling.
  const onSubmit = (values: DirectAddFosterFormValues) => {
    startSubmitTransition(async () => {
      const result = await createFosterProfileDirect(values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
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
        <Card className="w-full max-w-3xl mx-auto @container/card">
          <CardHeader>
            <CardTitle className="@[650px]/card:text-xl">Add Foster</CardTitle>
            <CardDescription>
              For walk-ins and emergencies — creates an active foster profile
              directly, without a reviewed application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <FormField
              control={form.control}
              name="personId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Person *</FormLabel>
                  <FormControl>
                    <PersonPicker
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? "")}
                      suggestedPersonId={suggestedPersonId}
                      suggestedPersonLabel={suggestedPersonLabel}
                      canCreatePerson={canCreatePerson}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FosterCapabilityFormFields
              form={
                form as unknown as ReturnType<
                  typeof useForm<FosterApplicationFormValues>
                >
              }
              species={species}
            />
          </CardContent>
          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={returnTo || "/dashboard/fosters"}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Creating..." : "Create Foster Profile"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
