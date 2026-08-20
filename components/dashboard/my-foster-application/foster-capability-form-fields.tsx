"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FosterApplicationFormSchema } from "@/app/lib/zod-schemas/foster.schemas";
import { NumberField } from "@/components/forms/number-field";

type FosterApplicationFormValues = z.input<typeof FosterApplicationFormSchema>;

interface SpeciesOption {
  id: string;
  name: string;
}

// Yes/No/Unspecified select, matching the household form's boolToSelectValue
// conventions (undefined = not specified).
const YesNoSelect = ({
  value,
  onChange,
}: {
  value: "true" | "false" | undefined;
  onChange: (value: "true" | "false") => void;
}) => (
  // value is coerced to "" rather than left undefined so Select is controlled
  // from the first render — an undefined->defined switch later trips React's
  // "uncontrolled to controlled" warning.
  <Select onValueChange={onChange} value={value ?? ""}>
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
);

export const FosterCapabilityFormFields = ({
  form,
  species,
}: {
  form: ReturnType<typeof useForm<FosterApplicationFormValues>>;
  species: SpeciesOption[];
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-8">
      <FormField
        control={form.control}
        name="speciesIds"
        render={({ field }) => {
          const selectedIds: string[] = field.value || [];
          const toggle = (id: string) => {
            if (selectedIds.includes(id)) {
              field.onChange(selectedIds.filter((x) => x !== id));
            } else {
              field.onChange([...selectedIds, id]);
            }
          };
          return (
            <FormItem className="col-span-full flex flex-col">
              <FormLabel>Species you can foster *</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {selectedIds.length > 0
                        ? `${selectedIds.length} selected`
                        : "Select species"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                  <Command>
                    <CommandInput placeholder="Search species..." />
                    <CommandList>
                      <CommandEmpty>No species found.</CommandEmpty>
                      <CommandGroup>
                        {species.map((s) => {
                          const checked = selectedIds.includes(s.id);
                          return (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => toggle(s.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  checked ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {s.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedIds.map((id) => {
                    const s = species.find((s) => s.id === id);
                    if (!s) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {s.name}
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          className="rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <NumberField
        control={form.control}
        name="maxAnimals"
        label="Max animals at once"
        className="col-span-3"
        min={1}
      />

      <FormField
        control={form.control}
        name="hasQuarantineSpace"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Quarantine space available?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="canGiveOralMeds"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Can give oral medications?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="canBottleFeed"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Can bottle-feed?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="canTransport"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Can transport animals?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="acceptsMedical"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Willing to foster medical cases?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="acceptsHospice"
        render={({ field }) => (
          <FormItem className="col-span-2">
            <FormLabel>Willing to foster hospice cases?</FormLabel>
            <YesNoSelect value={field.value} onChange={field.onChange} />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="availabilityNotes"
        render={({ field }) => (
          <FormItem className="col-span-full">
            <FormLabel>Availability Notes</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Anything else we should know about your availability (schedule, upcoming travel, etc.)."
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
