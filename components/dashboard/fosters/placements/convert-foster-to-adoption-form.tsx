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
import { convertFosterToAdoption } from "@/app/lib/actions/foster-placement.actions";
import { ConvertFosterToAdoptionSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

type ConvertFormValues = z.input<typeof ConvertFosterToAdoptionSchema>;

interface ConvertFosterToAdoptionFormProps {
  placement: {
    id: string;
    animal: { id: string; name: string };
    fosterProfile: { person: { name: string } };
  };
}

export function ConvertFosterToAdoptionForm({
  placement,
}: ConvertFosterToAdoptionFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startSubmitTransition] = useTransition();
  const router = useRouter();

  const form = useForm<ConvertFormValues>({
    resolver: standardSchemaResolver(ConvertFosterToAdoptionSchema),
    defaultValues: { placementId: placement.id },
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
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This ends the placement, archives {placement.animal.name}&apos;s
          record, and creates an adoption outcome — the same as processing any
          other adoption. This cannot be undone from here.
        </p>
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
