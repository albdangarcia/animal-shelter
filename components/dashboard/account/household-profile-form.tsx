"use client";

import {
  updateMyHouseholdProfile,
  updateStaffHouseholdProfile,
} from "@/app/lib/actions/household-profile.actions";
import { useState, useTransition } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, useWatch, type DefaultValues, type UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import {
  HouseholdFieldsSchema,
  isRenting,
  type HouseholdFieldsInput,
} from "@/app/lib/zod-schemas/household-profile.schemas";
import {
  formatSingleEnumOption,
  livingSituationOptions,
} from "@/app/lib/utils/enum-formatter";
import { HouseholdProfilePayload } from "@/app/lib/types";
import { boolToSelectValue } from "@/app/lib/utils/form-utils";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";

export type HouseholdProfileFormValues = HouseholdFieldsInput;

interface HouseholdProfileFormProps {
  householdProfile?: HouseholdProfilePayload | null;
  mode?: "self" | "staff-edit" | "staff-view";
  personId?: string;
  canManage?: boolean;
}

// Both variants prefill identically
const buildDefaultValues = (
  householdProfile?: HouseholdProfilePayload | null,
): DefaultValues<HouseholdProfileFormValues> => ({
  livingSituation:
    householdProfile?.livingSituation || livingSituationOptions[0].value,
  hasYard: boolToSelectValue(householdProfile?.hasYard),
  landlordPermission: boolToSelectValue(householdProfile?.landlordPermission),
  hasChildren: boolToSelectValue(householdProfile?.hasChildren),
  householdSize: String(householdProfile?.householdSize ?? 1),
  childrenAges: householdProfile?.childrenAges?.join(", ") || "",
  otherAnimalsDescription: householdProfile?.otherAnimalsDescription || "",
  animalExperience: householdProfile?.animalExperience || "",
});

// Shared read-only rows

const boolDisplay = (val: boolean | null | undefined) => {
  if (val === null || val === undefined) return "N/A";
  return val ? "Yes" : "No";
};

export const HouseholdReadOnlyRows = ({
  hp,
}: {
  hp: HouseholdProfilePayload | null | undefined;
}) => {
  if (!hp) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No household information on file.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Living Situation</span>
        <span>{formatSingleEnumOption(hp.livingSituation)}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Household Size</span>
        <span>{hp.householdSize ?? "N/A"}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Has Yard</span>
        <span>{boolDisplay(hp.hasYard)}</span>
      </div>
      {/* Null here now means "not renting", not "unanswered" — the row is
          hidden rather than showing a meaningless N/A. */}
      {isRenting(hp.livingSituation) && (
        <div className="flex items-center justify-between border-b pb-2 text-sm">
          <span className="text-muted-foreground">Landlord Permission</span>
          <span>{boolDisplay(hp.landlordPermission)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Has Children</span>
        <span>{boolDisplay(hp.hasChildren)}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Children Ages</span>
        <span>
          {hp.childrenAges.length > 0 ? hp.childrenAges.join(", ") : "N/A"}
        </span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Other Animals</span>
        <span>{hp.otherAnimalsDescription || "N/A"}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Animal Experience</span>
        <span>{hp.animalExperience || "N/A"}</span>
      </div>
    </div>
  );
};

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
            <FormLabel>Household Size *</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                max={50}
                {...field}
                onChange={(e) => field.onChange(e.target.value)}
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

const SelfHouseholdForm = ({
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

const StaffHouseholdCard = ({
  householdProfile,
  personId,
  canManage,
  editable,
}: {
  householdProfile?: HouseholdProfilePayload | null;
  personId: string;
  canManage?: boolean;
  editable: boolean;
}) => {
  const [isPending, startSubmitTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<HouseholdProfileFormValues>({
    resolver: standardSchemaResolver(HouseholdFieldsSchema),
    defaultValues: buildDefaultValues(householdProfile),
  });

  const onSubmit = (values: HouseholdProfileFormValues) => {
    startSubmitTransition(async () => {
      const result = await updateStaffHouseholdProfile(personId, values);

      if (result.ok) {
        toast.success(result.message);
        form.reset(values);
        setIsEditing(false);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  const handleCancel = () => {
    form.reset();
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Household & Lifestyle</CardTitle>
              <CardDescription>
                Home environment and animal experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-10">
              <HouseholdFormFields form={form} />
            </CardContent>
            <CardFooter className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? "Saving..." : "Save"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household & Lifestyle</CardTitle>
        <CardDescription>
          Home environment and animal experience.
        </CardDescription>
        {editable && canManage && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit Household Info
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <HouseholdReadOnlyRows hp={householdProfile} />
      </CardContent>
    </Card>
  );
};

// Public export

const HouseholdProfileForm = ({
  householdProfile,
  mode = "self",
  personId,
  canManage,
}: HouseholdProfileFormProps) => {
  if (mode === "self") {
    return <SelfHouseholdForm householdProfile={householdProfile} />;
  }

  return (
    <StaffHouseholdCard
      householdProfile={householdProfile}
      personId={personId!}
      canManage={canManage}
      editable={mode === "staff-edit"}
    />
  );
};

export default HouseholdProfileForm;