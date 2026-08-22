"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { US_STATES } from "@/app/lib/constants/us-states";
import type { UseFormReturn } from "react-hook-form";
import type { PersonFormValues } from "./person-form";

interface PersonFormFieldsProps {
  form: UseFormReturn<PersonFormValues>;
  mode: "staff" | "self";
}

export const PersonFormFields = ({
  form,
  mode,
}: PersonFormFieldsProps) => (
  <div className="space-y-6">
    <h3 className="font-semibold border-b pb-2">Contact Information</h3>
    {mode !== "self" && (
      <p className="text-sm text-muted-foreground">
        Provide at least an email or phone number so this person can be
        contacted.
      </p>
    )}
    <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem className="col-span-4">
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Jane Doe"
                {...field}
                autoComplete="off"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem className="col-span-3">
            <FormLabel>
              Email
              {mode !== "self" && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (or phone)
                </span>
              )}
            </FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="e.g., jane@example.com"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem className="col-span-3">
            <FormLabel>
              Phone
              {mode !== "self" && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (or email)
                </span>
              )}
            </FormLabel>
            <FormControl>
              <Input placeholder="e.g., (555) 123-4567" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem className="col-span-full">
            <FormLabel>Street Address</FormLabel>
            <FormControl>
              <Input placeholder="e.g., 123 Main St" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="city"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>City</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Anytown" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="state"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>State</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {US_STATES.map((state) => (
                  <SelectItem key={state.code} value={state.code}>
                    {state.name}
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
        name="zipCode"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Zip Code</FormLabel>
            <FormControl>
              <Input placeholder="e.g., 12345" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  </div>
);
