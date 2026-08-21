"use client";

import { createReIntake } from "@/app/lib/actions/intake.actions";
import { startTransition, useActionState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { animalHealthStatusOptions } from "@/app/lib/utils/enum-formatter";
import { AnimalReIntakeFormPayload, PartnerPayload } from "@/app/lib/types";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import { ReIntakeFormSchema } from "@/app/lib/zod-schemas/intake.schema";

type ReIntakeFormValues = z.infer<typeof ReIntakeFormSchema>;

interface ReIntakeFormProps {
  animal: AnimalReIntakeFormPayload;
  partners: PartnerPayload[];
}

const ReIntakeForm = ({ animal, partners }: ReIntakeFormProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  const action = createReIntake.bind(null, animal.id);

  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_FORM_STATE,
  );

  const form = useForm({
    resolver: zodResolver(ReIntakeFormSchema),
    defaultValues: {
      intakeDate: new Date(),
      intakeType: undefined,
      healthStatus: animalHealthStatusOptions[0].value,
      notes: "",
      sourcePartnerId: "",
      foundAddress: "",
      foundCity: "",
      foundState: "",
      surrenderingPersonId: "",
    },
  });

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }

    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof ReIntakeFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    }
  }, [state, form]);

  const onSubmit = (data: ReIntakeFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Re-Intake Animal: {animal.name}</CardTitle>
            <CardDescription>
              This animal is returning to the shelter. Record the new intake
              details below to reactivate their profile.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10">
            {/* Health Status Selection */}
            <div className="space-y-6">
              <h3 className="font-semibold border-b pb-2">
                Current Health Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="healthStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Health Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select health status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {animalHealthStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Intake Fields Component */}
            <IntakeFormFields
              control={form.control}
              partners={partners}
              returnTo={returnTo}
            />
          </CardContent>

          <CardFooter className="flex justify-end space-x-4">
            <Button
              asChild
              variant="outline"
              type="button"
              disabled={isPending}
            >
              <Link href={`/dashboard/animals/${animal.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Processing..." : "Process Re-Intake"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default ReIntakeForm;
