"use client";

import * as React from "react";
import { Check, PlusCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface ServerSideFacetedFilterProps {
  title?: string;
  paramKey: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  /**
   * Merged into PopoverContent. The popover portals to <body>, so a caller
   * inside a token scope (the public pages' `.theme-organic`) has to re-open it
   * here — that decision belongs at the call site, since this filter is shared
   * and every dashboard caller must keep inheriting the dashboard's theme.
   */
  contentClassName?: string;
  /**
   * Merged into the trigger button. Opt-in for the same reason as
   * `contentClassName`: the public pages want a solid pill, every dashboard
   * caller wants the dense dashed trigger it already has. Pass `border-solid`
   * to drop the dash — tailwind-merge treats border-style and border-color as
   * separate groups, so `border-border` alone will not displace it.
   */
  triggerClassName?: string;
  /** Merged into the selected-count badges in the trigger. Opt-in, as above. */
  badgeClassName?: string;
}

export function ServerSideFacetedFilter({
  title,
  paramKey,
  options,
  contentClassName,
  triggerClassName,
  badgeClassName,
}: ServerSideFacetedFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

  const selectedValues = new Set(searchParams.get(paramKey)?.split(","));

  const handleFilterChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    const currentValues = params.get(paramKey)?.split(",") || [];
    const newValues = new Set(currentValues.filter(Boolean));

    if (newValues.has(value)) {
      newValues.delete(value);
    } else {
      newValues.add(value);
    }

    if (newValues.size > 0) {
      params.set(paramKey, Array.from(newValues).join(","));
    } else {
      params.delete(paramKey);
    }

    params.set("page", "1"); // Reset to page 1 on filter change
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", triggerClassName)}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-sm px-1 font-normal lg:hidden",
                  badgeClassName
                )}
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className={cn("rounded-sm px-1 font-normal", badgeClassName)}
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className={cn(
                          "rounded-sm px-1 font-normal",
                          badgeClassName
                        )}
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-50 p-0", contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleFilterChange(option.value)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      {/* text-primary-foreground is load-bearing, not
                          decoration: CommandItem carries
                          `[&_svg:not([class*='text-'])]:text-muted-foreground`,
                          so an unclassed icon is recolored by the row and the
                          check came out dark on the filled --primary swatch.
                          Naming the token both opts out of that selector and
                          states the pairing, and it resolves per theme scope —
                          cream on terracotta in .theme-organic, and the
                          dashboard's own values in light and dark. */}
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete(paramKey);
                      params.set("page", "1");
                      replace(`${pathname}?${params.toString()}`);
                    }}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}