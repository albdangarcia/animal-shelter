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

interface ServerSideSortProps {
  paramKey: string;
  placeholder?: string;
  options: {
    label: string;
    value: string;
  }[];
}

export function ServerSideSort({
  paramKey,
  placeholder,
  options,
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
        <SelectTrigger id="sort-order" className="w-40 font-medium" size="sm">
          <ArrowUpDown className="size-4 mr-2.5 text-black" />
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
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
