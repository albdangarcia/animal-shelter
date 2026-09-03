"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ServerSideSortProps {
  paramKey: string;
  placeholder?: string;
  options: {
    label: string;
    value: string;
  }[];
  /**
   * Merged into SelectContent. The select portals to <body>, so a caller inside
   * a token scope (the public pages' `.theme-organic`) has to re-open it here —
   * that decision belongs at the call site, since this control is shared and
   * every dashboard caller must keep inheriting the dashboard's theme.
   */
  contentClassName?: string;
  /**
   * Merged into SelectTrigger. Opt-in for the same reason as
   * `contentClassName`: the public pages want a pill, every dashboard caller
   * wants the trigger it already has.
   */
  triggerClassName?: string;
}

export function ServerSideSort({
  paramKey,
  placeholder,
  options,
  contentClassName,
  triggerClassName,
}: ServerSideSortProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentValue = searchParams.get(paramKey) || options[0]?.value;

  const handleValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(paramKey, value);
    } else {
      params.delete(paramKey);
    }
    params.set("page", "1"); // Reset to page 1 on sort change
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <Label htmlFor="sort-order" className="sr-only text-sm font-medium">
        Sort by:
      </Label>
      <Select onValueChange={handleValueChange} value={currentValue}>
        <SelectTrigger
          id="sort-order"
          className={cn("w-40 font-medium", triggerClassName)}
          size="sm"
        >
          <ArrowUpDown className="size-4 mr-2.5 text-muted-foreground" />
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={cn(contentClassName)}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}