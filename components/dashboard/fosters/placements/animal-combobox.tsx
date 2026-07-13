"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { calculateAgeString } from "@/app/lib/utils/date-utils";
import { getInitials } from "@/components/dashboard/locations/animal-chip";
import type { FosterableAnimalOption } from "@/app/lib/data/fosters/fosters.data";

interface AnimalComboboxProps {
  options: FosterableAnimalOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

// "Species · age · breed" — the line every row shares regardless of
// whether it ends up being an ambiguous match.
const detailLine = (animal: FosterableAnimalOption) => {
  const age = calculateAgeString({ birthDate: animal.birthDate, simple: true });
  return [animal.speciesName, age, animal.breed].filter(Boolean).join(" · ");
};

const AnimalThumbnail = ({
  animal,
  className,
}: {
  animal: FosterableAnimalOption;
  className?: string;
}) => (
  <Avatar className={cn("size-8 shrink-0", className)}>
    {animal.thumbnailUrl && (
      <AvatarImage src={animal.thumbnailUrl} alt="" className="object-cover" />
    )}
    <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">
      {getInitials(animal.name)}
    </AvatarFallback>
  </Avatar>
);

export function AnimalCombobox({
  options,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: AnimalComboboxProps) {
  const [open, setOpen] = useState(false);

  // Animal has no human-facing tag number (see fosters.data.ts), so two
  // animals sharing a name are otherwise distinguished by species/age/breed.
  // The rare row that still collides on all of those gets a short cuid
  // fragment appended as the tiebreaker of last resort.
  const ambiguousIds = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const animal of options) {
      const key = `${animal.name}|${detailLine(animal)}`;
      groups.set(key, [...(groups.get(key) ?? []), animal.id]);
    }
    const ids = new Set<string>();
    for (const group of groups.values()) {
      if (group.length > 1) {
        group.forEach((animalId) => ids.add(animalId));
      }
    }
    return ids;
  }, [options]);

  const selected = options.find((animal) => animal.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <AnimalThumbnail animal={selected} className="size-5" />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            "Select an in-care animal"
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search animals…" />
          <CommandList>
            <CommandEmpty>No in-care animals match.</CommandEmpty>
            <CommandGroup>
              {options.map((animal) => {
                const isSelected = animal.id === value;
                const idFragment = ambiguousIds.has(animal.id)
                  ? animal.id.slice(-6)
                  : null;

                return (
                  <CommandItem
                    key={animal.id}
                    // cmdk filters on `value`, so name/species must live here
                    // for typing either to filter the row. The id is appended
                    // only so same-name-and-details rows get distinct values
                    // (cmdk tracks the active row by value equality) — it's
                    // never shown to the user.
                    value={`${animal.name} ${animal.speciesName} ${animal.id}`}
                    onSelect={() => {
                      onChange(animal.id);
                      setOpen(false);
                    }}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                    <AnimalThumbnail animal={animal} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{animal.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {detailLine(animal)}
                        {idFragment && ` · #${idFragment}`}
                      </p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
