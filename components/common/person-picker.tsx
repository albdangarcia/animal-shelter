"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDebouncedCallback } from "use-debounce";
import { ChevronsUpDown, UserPlus, X } from "lucide-react";
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
import { PersonPickerOption } from "@/app/lib/types";

interface PersonPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  suggestedPersonId?: string;
  suggestedPersonLabel?: string;
  returnTo: string;
  // Shows the "Add a new person" round-trip link. Defaults to false: creation
  // needs PERSONS_MANAGE, which only a server component can check, so the host
  // must opt in explicitly. Fails closed — a host that omits it hides a button
  // rather than offering one that errors on submit.
  canCreatePerson?: boolean;
}

export const PersonPicker = ({
  value,
  onChange,
  suggestedPersonId,
  suggestedPersonLabel,
  returnTo,
  canCreatePerson = false,
}: PersonPickerProps) => {
  const [selected, setSelected] = useState<PersonPickerOption | null>(() => {
    if (value == null && suggestedPersonId) {
      return {
        id: suggestedPersonId,
        name: suggestedPersonLabel ?? "Suggested person",
        email: null,
        phone: null,
      };
    }
    return null;
  });

  // Apply the suggested default once, on mount, so it's still overridable
  // afterward without being reapplied every time value clears.
  const suggestionAppliedRef = useRef(false);
  useEffect(() => {
    if (!suggestionAppliedRef.current && value == null && suggestedPersonId) {
      suggestionAppliedRef.current = true;
      onChange(suggestedPersonId);
    }
  }, [value, suggestedPersonId, onChange]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonPickerOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Aborts the previous in-flight search whenever a new one starts or on close.
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = async (q: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/people/search?query=${encodeURIComponent(q)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error("Failed to search people.");
      }
      const people: PersonPickerOption[] = await response.json();
      if (abortControllerRef.current === controller) {
        setResults(people);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error searching people:", error);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsSearching(false);
      }
    }
  };

  const debouncedSearch = useDebouncedCallback(search, 300);

  const resetSearch = () => {
    debouncedSearch.cancel();
    abortControllerRef.current?.abort();
    setQuery("");
    setResults([]);
    setIsSearching(false);
  };

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
      abortControllerRef.current?.abort();
    };
  }, [debouncedSearch]);

  const handleSelect = (person: PersonPickerOption) => {
    setSelected(person);
    onChange(person.id);
    setOpen(false);
    resetSearch();
  };

  const handleClear = () => {
    setSelected(null);
    onChange(null);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm">
          <p className="truncate font-medium">{selected.name}</p>
          {(selected.email || selected.phone) && (
            <p className="truncate text-xs text-muted-foreground">
              {selected.email ?? selected.phone}
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetSearch();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-muted-foreground"
        >
          Search for a person...
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a name, email, or phone..."
            value={query}
            onValueChange={(newQuery) => {
              setQuery(newQuery);
              if (!newQuery.trim()) {
                debouncedSearch.cancel();
                abortControllerRef.current?.abort();
                setResults([]);
                setIsSearching(false);
              } else {
                debouncedSearch(newQuery);
              }
            }}
          />
          <CommandList>
            {isSearching ? (
              <CommandEmpty>Searching...</CommandEmpty>
            ) : results.length === 0 ? (
              canCreatePerson ? (
                <CommandGroup>
                  <CommandItem asChild value="add-new-person">
                    <Link
                      href={`/dashboard/people-directory/new?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add a new person
                    </Link>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <CommandEmpty>
                  {query.trim()
                    ? "No matching person found. Add them to the directory first, then start this intake."
                    : "Type a name, email, or phone number to search."}
                </CommandEmpty>
              )
            ) : (
              <CommandGroup>
                {results.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={person.id}
                    onSelect={() => handleSelect(person)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{person.name}</p>
                      {(person.email || person.phone) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {person.email ?? person.phone}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
