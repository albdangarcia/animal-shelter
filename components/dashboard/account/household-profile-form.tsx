"use client";

import { updateMyHouseholdProfile } from "@/app/lib/actions/household-profile.actions";
import { startTransition, useActionState, useEffect } from "react";
import {
  INITIAL_FORM_STATE,
  HouseholdProfileFormState,
} from "@/app/lib/form-state-types";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { HouseholdProfileFormSchema } from "@/app/lib/zod-schemas/household-profile.schemas";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { HouseholdProfilePayload } from "@/app/lib/types";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";

type HouseholdProfileFormValues = z.input<typeof HouseholdProfileFormSchema>;

interface HouseholdProfileFormProps {
  householdProfile?: HouseholdProfilePayload | null;
  returnTo?: string;
}

const HouseholdProfileForm = ({
  householdProfile,
  returnTo,
}: HouseholdProfileFormProps) => {
  const [state, formAction, isPending] = useActionState<
    HouseholdProfileFormState,
    FormData
  >(updateMyHouseholdProfile, INITIAL_FORM_STATE);

  const form = useForm<HouseholdProfileFormValues>({
  resolver: standardSchemaResolver(HouseholdProfileFormSchema),
  defaultValues: {
    livingSituation:
      householdProfile?.livingSituation || livingSituationOptions[0].value,
    hasYard: boolToSelectValue(householdProfile?.hasYard),
    landlordPermission: boolToSelectValue(householdProfile?.landlordPermission),
    hasChildren: boolToSelectValue(householdProfile?.hasChildren),
    householdSize: String(householdProfile?.householdSize ?? 1),
    childrenAges: householdProfile?.childrenAges?.join(", ") || "",
    otherAnimalsDescription: householdProfile?.otherAnimalsDescription || "",
    animalExperience: householdProfile?.animalExperience || "",
  },
});

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }

    if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof HouseholdProfileFormValues, {
          type: "server",
          message: Array.isArray(value) ? value.join(", ") : String(value),
        });
      }
    }
  }, [state, form]);

  const hasChildren = form.watch("hasChildren");

  const onSubmit = (data: HouseholdProfileFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }
    if (returnTo) {
      formData.append("returnTo", returnTo);
    }
    startTransition(() => {
      formAction(formData);
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
            <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
              <FormField
                control={form.control}
                name="livingSituation"
                render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel>Living Situation</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select living situation" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {livingSituationOptions.map((option) => (
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
              <FormField
                control={form.control}
                name="householdSize"
                render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel>Household Size</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hasYard"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Do you have a yard?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="landlordPermission"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Landlord permission (if renting)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hasChildren"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Do you have children at home?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {hasChildren === "true" && (
                <FormField
                  control={form.control}
                  name="childrenAges"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Ages of children</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 5, 8, 12" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter ages separated by commas.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="otherAnimalsDescription"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormLabel>Other Animals in the Home</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe any other pets currently in your household."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="animalExperience"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormLabel>Experience with Animals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us about your experience caring for pets."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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

export default HouseholdProfileForm;
