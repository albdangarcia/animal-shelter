"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCalendar } from "@tabler/icons-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Picks the calendar month a monthly report counts. Writes `month`
 * (`yyyy-MM`) into the URL via `router.replace`, keeping every other param;
 * the server resolves it, so `month` is the one it settled on.
 */
export function ReportMonthPicker({
  month,
  options,
}: {
  month: string;
  options: { value: string; label: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

  const pick = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("month", value);
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <Select value={month} onValueChange={pick}>
      <SelectTrigger size="sm" className="w-48" aria-label="Month">
        <IconCalendar aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
