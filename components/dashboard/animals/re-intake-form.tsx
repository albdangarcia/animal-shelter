"use client";

import { createReIntake } from "@/app/lib/actions/intake.actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { AnimalHealthStatus } from "@/prisma/generated/enums";
import { AnimalReIntakeFormPayload, PartnerPayload } from "@/app/lib/types";
import Link from "next/link";
import { IntakeFormFields } from "./intake-form-fields";
import {
  ReIntakeFormSchema,
  type ReIntakeFormInput,
} from "@/app/lib/zod-schemas/intake.schema";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

interface ReIntakeFormProps {
  animal: AnimalReIntakeFormPayload;
  partners: PartnerPayload[];
  canCreatePerson?: boolean;
}

const ReIntakeForm = ({
  animal,
  partners,
  canCreatePerson,
}: ReIntakeFormProps) => {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<ReIntakeFormInput>({
    resolver: standardSchemaResolver(ReIntakeFormSchema),
    defaultValues: {
      intakeDate: new Date(),
      intakeType: undefined,
      healthStatus: AnimalHealthStatus.HEALTHY,
      notes: "",
      sourcePartnerId: "",
      foundAddress: "",
      foundCity: "",
      foundState: "",
      surrenderingPersonId: "",
    },
  });

  const onSubmit = (values: ReIntakeFormInput) => {
    startSubmitTransition(async () => {
      const result = await createReIntake(animal.id, values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
        }
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
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
              canCreatePerson={canCreatePerson}
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
