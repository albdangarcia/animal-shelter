"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { LinkablePersonPayload } from "@/app/lib/types";

export type SelectedPerson = {
  id: string;
  name: string;
  isDeactivatedContactHere: boolean;
};

interface Props {
  people: LinkablePersonPayload[];
  value: SelectedPerson | null;
  onChange: (person: SelectedPerson | null) => void;
  disabled?: boolean;
}

export const PartnerContactPicker = ({ people, value, onChange, disabled }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (person: LinkablePersonPayload) => {
    onChange({
      id: person.id,
      name: person.name,
      isDeactivatedContactHere: person.isDeactivatedContactHere,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value ? value.name : "Search for a person..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Type a name or email..." />
          <CommandList>
            <CommandEmpty>No people found.</CommandEmpty>
            <CommandGroup>
              {people.map((person) => (
                <CommandItem
                  key={person.id}
                  value={`${person.name} ${person.email ?? ""} ${person.id}`}
                  onSelect={() => handleSelect(person)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.id === person.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate">{person.name}</p>
                      {person.email ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {person.email}
                        </p>
                      ) : null}
                    </div>
                    {person.isDeactivatedContactHere ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"
                      >
                        Deactivated here
                      </Badge>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
