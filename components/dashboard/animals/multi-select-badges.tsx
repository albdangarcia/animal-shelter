"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl } from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Option = { id: string; name: string };

/**
 * A searchable pick of several, shown as removable badges under its trigger:
 * the animal form's Additional Breeds and Additional Colors. Rendered inside
 * a `FormItem`, whose label names the trigger. `excludeId` is the one already
 * named in its own field (Breed, Primary Color), left out of the list.
 */
export const MultiSelectBadges = ({
  options,
  excludeId,
  selectedIds,
  onChange,
  disabled = false,
  placeholder,
  searchPlaceholder,
  emptyText,
}: {
  options: Option[];
  excludeId?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}) => {
  const available = options.filter((option) => option.id !== excludeId);
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {available.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => toggle(option.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedIds.includes(option.id)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {option.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedIds.map((id) => {
            const option = options.find((o) => o.id === id);
            if (!option) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1">
                {option.name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${option.name}`}
                  disabled={disabled}
                  className="rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </>
  );
};
