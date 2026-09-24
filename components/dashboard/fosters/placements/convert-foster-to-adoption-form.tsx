"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { convertFosterToAdoption } from "@/app/lib/actions/foster-placement.actions";
import { ConvertFosterToAdoptionSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { ApprovedFosterApplicationOption } from "@/app/lib/data/fosters/fosters.data";

type ConvertFormValues = z.input<typeof ConvertFosterToAdoptionSchema>;

// No application is a legitimate choice (a walk-in-style adoption with
// nothing to link), so the radio group needs a value of its own for it —
// `adoptionApplicationId` itself stays undefined until an application is
// picked.
const NO_APPLICATION = "none";

interface ConvertFosterToAdoptionFormProps {
  placement: {
    id: string;
    animal: { id: string; name: string };
    fosterProfile: { person: { name: string } };
  };
  approvedApplications: ApprovedFosterApplicationOption[];
}

export function ConvertFosterToAdoptionForm({
  placement,
  approvedApplications,
}: ConvertFosterToAdoptionFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const form = useForm<ConvertFormValues>({
    resolver: standardSchemaResolver(ConvertFosterToAdoptionSchema),
    defaultValues: {
      placementId: placement.id,
      // Pre-select the one approved application there is — leaving it on
      // "None" by default is how an application ends up reading closed
      // instead of adopted, the exact bug this picker exists to fix. With
      // more than one, nothing tells us which one is right, so it starts
      // unselected instead.
      adoptionApplicationId:
        approvedApplications.length === 1
          ? approvedApplications[0].id
          : undefined,
    },
  });

  const onSubmit = (values: ConvertFormValues) => {
    startSubmitTransition(async () => {
      const result = await convertFosterToAdoption(values);

      if (result.ok) {
        toast.success(result.message);
        if (result.redirectTo) {
          router.push(result.redirectTo);
          return;
        }
        setOpen(false);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Convert to Adoption</CardTitle>
        <CardDescription>
          Close out {placement.animal.name}&apos;s foster-to-adopt placement
          with {placement.fosterProfile.person.name} and record it as an
          adoption.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          This ends the placement, archives {placement.animal.name}&apos;s
          record, and creates an adoption outcome — the same as processing any
          other adoption. This cannot be undone from here.
        </p>
        {approvedApplications.length > 0 && (
          <Form {...form}>
            <FormField
              control={form.control}
              name="adoptionApplicationId"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>
                    Link {placement.fosterProfile.person.name}&apos;s approved
                    application
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(value) =>
                        field.onChange(
                          value === NO_APPLICATION ? undefined : value,
                        )
                      }
                      value={field.value ?? NO_APPLICATION}
                      className="space-y-2"
                    >
                      {approvedApplications.map((application) => (
                        <FormItem
                          key={application.id}
                          className="flex items-center space-x-2"
                        >
                          <FormControl>
                            <RadioGroupItem value={application.id} />
                          </FormControl>
                          <FormLabel className="font-normal">
                            {application.applicantName}&apos;s application
                          </FormLabel>
                        </FormItem>
                      ))}
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value={NO_APPLICATION} />
                        </FormControl>
                        <FormLabel className="font-normal">
                          None
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        )}
      </CardContent>
      <CardFooter className="flex justify-end space-x-4">
        <Button asChild variant="outline" type="button" disabled={isPending}>
          <Link href={`/dashboard/animals/${placement.animal.id}`}>
            Cancel
          </Link>
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" size="lg" disabled={isPending}>
              Convert to Adoption
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm adoption</AlertDialogTitle>
              <AlertDialogDescription>
                {placement.animal.name} will be marked as adopted by{" "}
                {placement.fosterProfile.person.name}. This action is final.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  form.handleSubmit(onSubmit)();
                }}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Convert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
