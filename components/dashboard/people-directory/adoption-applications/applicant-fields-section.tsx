"use client";

import { Control, useWatch } from "react-hook-form";
import type { LivingSituation } from "@/prisma/generated/enums";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { US_STATES } from "@/app/lib/constants/us-states";
import { livingSituationOptions } from "@/app/lib/utils/enum-formatter";
import { NumberInput } from "@/components/forms/number-input";

/**
 * The exact subset of fields this section renders. Both staff adoption forms
 * (create + edit) share these fields:
 *  - create uses StaffAdoptionApplicationFormSchema (MyAdoptionAppFormSchema + animalId)
 *  - edit uses MyAdoptionAppFormSchema
 * Since the create schema is a superset, both forms' `control` are structurally
 * compatible with Control<ApplicantFieldValues>. Each call site passes
 * `control={form.control as Control<ApplicantFieldValues>}` — one explicit cast,
 * the same single-cast pattern used in the intake form. The types below mirror
 * the inferred Zod types exactly (note the "true" | "false" string unions, the
 * required LivingSituation enum, the now-numeric householdSize, and the
 * optional landlordPermission the shared household refinement only requires
 * when renting) so field names AND value types stay checked inside this
 * component.
 */
export interface ApplicantFieldValues {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddressLine1: string;
  applicantAddressLine2?: string;
  applicantCity: string;
  applicantState: string;
  applicantZipCode: string;
  livingSituation: LivingSituation;
  householdSize: number;
  hasYard: "true" | "false";
  landlordPermission?: "true" | "false";
  hasChildren: "true" | "false";
  childrenAges: string;
  otherAnimalsDescription?: string;
  animalExperience: string;
  reasonForAdoption: string;
}

interface ApplicantFieldsSectionProps {
  control: Control<ApplicantFieldValues>;
}

/**
 * Renders the three shared field groups for the staff adoption application forms:
 * Applicant Information, Home & Lifestyle, and Experience & Intent.
 *
 * Wording is third-person throughout, because staff complete these forms on
 * behalf of a walk-in applicant. The public-facing MyApplicationForm uses
 * first-person wording and is intentionally NOT served by this component.
 */
export const ApplicantFieldsSection = ({
  control,
}: ApplicantFieldsSectionProps) => {
  // useWatch rather than a passed-in watch(): watch() returns a function the
  // React Compiler cannot memoize safely, so it skips compiling the whole
  // component. Taking `control` alone also drops one cast per call site.
  const hasChildrenValue = useWatch({ control, name: "hasChildren" });

  return (
    <>
      {/* Applicant Information */}
      <div className="space-y-6">
        <h3 className="font-semibold border-b pb-2">Applicant Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={control}
            name="applicantName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name *</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="applicantEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="applicantPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone *</FormLabel>
                <FormControl>
                  <Input placeholder="(123) 456-7890" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Separator />
        <div className="space-y-6">
          <FormField
            control={control}
            name="applicantAddressLine1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address Line 1 *</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="applicantAddressLine2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address Line 2</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Apt, Suite, etc. (Optional)"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
              control={control}
              name="applicantCity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="applicantState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a state" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="applicantZipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

      {/* Home & Lifestyle */}
      <div className="space-y-8">
        <h3 className="font-semibold border-b pb-2">Home &amp; Lifestyle</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField
            control={control}
            name="livingSituation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Living Situation *</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger>
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
          {/* Raw FormField rather than NumberField: this one carries a
              FormDescription, which the wrapper has no slot for. */}
          <FormField
            control={control}
            name="householdSize"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Household Size *</FormLabel>
                <FormControl>
                  <NumberInput min={1} max={50} {...field} />
                </FormControl>
                <FormDescription>
                  Including the applicant, how many people live in the home?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="hasYard"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="text-sm font-medium">
                  Do they have a yard? *
                </div>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex items-center space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="true" />
                      </FormControl>
                      <FormLabel className="font-normal">Yes</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="false" />
                      </FormControl>
                      <FormLabel className="font-normal">No</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* TODO: follow HouseholdFormFields and render this only when
              isRenting(livingSituation). The shared household refinement now
              requires it only for renters, so the star here overstates it and
              homeowners answer a question toHouseholdData() stores as null. */}
          <FormField
            control={control}
            name="landlordPermission"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="text-sm font-medium">
                  If they rent, do they have landlord permission? *
                </div>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    className="flex items-center space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="true" />
                      </FormControl>
                      <FormLabel className="font-normal">Yes</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="false" />
                      </FormControl>
                      <FormLabel className="font-normal">No</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="hasChildren"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="text-sm font-medium">
                  Are there children in the home? *
                </div>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex items-center space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="true" />
                      </FormControl>
                      <FormLabel className="font-normal">Yes</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="false" />
                      </FormControl>
                      <FormLabel className="font-normal">No</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {hasChildrenValue === "true" && (
            <FormField
              control={control}
              name="childrenAges"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Children&apos;s Ages *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 5, 12, 15" {...field} />
                  </FormControl>
                  <FormDescription>
                    Please provide a comma-separated list of ages.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <Separator />
        <FormField
          control={control}
          name="otherAnimalsDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Other Animals</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe other animals in the home (species, age, temperament, etc.)."
                  className="resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Experience & Intent */}
      <div className="space-y-8">
        <h3 className="font-semibold border-b pb-2">Experience &amp; Intent</h3>
        <FormField
          control={control}
          name="animalExperience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Animal Experience *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Please describe their experience with animals, including past ownership."
                  className="resize-y min-h-25"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="reasonForAdoption"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason for Adoption *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Why does this person want to adopt at this time? What are they looking for in a companion?"
                  className="resize-y min-h-25"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
};