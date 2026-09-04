"use client";

import { useWatch, type DefaultValues, type UseFormReturn } from "react-hook-form";
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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  isRenting,
  type HouseholdFieldsInput,
} from "@/app/lib/zod-schemas/household-profile.schemas";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { HouseholdProfilePayload } from "@/app/lib/types";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";
import { NumberField } from "@/components/forms/number-field";

export type HouseholdProfileFormValues = HouseholdFieldsInput;

// Both variants prefill identically
export const buildDefaultValues = (
  householdProfile?: HouseholdProfilePayload | null,
): DefaultValues<HouseholdProfileFormValues> => ({
  livingSituation: householdProfile?.livingSituation ?? undefined,
  hasYard: boolToSelectValue(householdProfile?.hasYard),
  landlordPermission: boolToSelectValue(householdProfile?.landlordPermission),
  hasChildren: boolToSelectValue(householdProfile?.hasChildren),
  householdSize: householdProfile?.householdSize ?? 1,
  childrenAges: householdProfile?.childrenAges?.join(", ") || "",
  otherAnimalsDescription: householdProfile?.otherAnimalsDescription || "",
  animalExperience: householdProfile?.animalExperience || "",
});

export const HouseholdFormFields = ({
  form,
}: {
  form: UseFormReturn<HouseholdProfileFormValues>;
}) => {
  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize safely, so it skips compiling the whole component.
  // This call site was never flagged by react-hooks/incompatible-library only
  // because `form` arrives as a prop and the rule can't trace its origin.
  const hasChildren = useWatch({ control: form.control, name: "hasChildren" });
  const livingSituation = useWatch({
    control: form.control,
    name: "livingSituation",
  });

  const renting = isRenting(livingSituation);

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
      <FormField
        control={form.control}
        name="livingSituation"
        render={({ field }) => (
          <FormItem className="col-span-3">
            <FormLabel>Living Situation *</FormLabel>
            {/* value coerced to "" so Select stays controlled from the first
                render — undefined->defined later trips React's
                "uncontrolled to controlled" warning. */}
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
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

      <NumberField
        control={form.control}
        name="householdSize"
        label="Household Size *"
        className="col-span-3"
        min={1}
        max={50}
      />

      <FormField
        control={form.control}
        name="hasYard"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Do you have a yard? *</FormLabel>
            {/* value coerced to "" so Select stays controlled from the first
                render — undefined->defined later trips React's
                "uncontrolled to controlled" warning. */}
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
              <FormControl>
                <SelectTrigger className="w-full">
                  {/* Was "Not specified", which implied a resting state the
                      schema has never accepted. */}
                  <SelectValue placeholder="Select Yes or No" />
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

      {/* Only meaningful for renters. Homeowners previously had to answer it
          anyway, and their answer was stored as a real boolean. */}
      {renting && (
        <FormField
          control={form.control}
          name="landlordPermission"
          render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Do you have landlord permission? *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ""}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Yes or No" />
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
      )}

      <FormField
        control={form.control}
        name="hasChildren"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Do you have children at home? *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Yes or No" />
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
              <FormDescription>Enter ages separated by commas.</FormDescription>
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
            <FormLabel>Experience with Animals *</FormLabel>
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
  );
};
