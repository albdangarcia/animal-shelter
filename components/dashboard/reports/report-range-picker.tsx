"use client";

import * as React from "react";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCalendar } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Parses a `yyyy-MM-dd` label into a local calendar `Date` (midnight). Built
 * from explicit y/m/d parts so it round-trips through `format(..,"yyyy-MM-dd")`
 * regardless of the viewer's timezone. Returns `undefined` when malformed.
 */
function parseYmd(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Popover date-range control. Writes `from`/`to` (`yyyy-MM-dd`) into the URL
 * via `router.replace`, preserving every other param (species, etc.). A
 * "Year to date" action clears both, letting the server fall back to the
 * default range.
 */
export function ReportRangePicker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const [open, setOpen] = React.useState(false);

  const fromDate = parseYmd(searchParams.get("from"));
  const toDate = parseYmd(searchParams.get("to"));

  const selected: DateRange | undefined =
    fromDate || toDate ? { from: fromDate, to: toDate } : undefined;

  const applyRange = (range: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (range?.from) params.set("from", format(range.from, "yyyy-MM-dd"));
    else params.delete("from");
    if (range?.to) params.set("to", format(range.to, "yyyy-MM-dd"));
    else params.delete("to");
    replace(`${pathname}?${params.toString()}`);
  };

  const resetToYearToDate = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("from");
    params.delete("to");
    replace(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  const triggerLabel =
    fromDate && toDate
      ? `${format(fromDate, "MMM d, yyyy")} – ${format(toDate, "MMM d, yyyy")}`
      : fromDate
        ? `From ${format(fromDate, "MMM d, yyyy")}`
        : toDate
          ? `Until ${format(toDate, "MMM d, yyyy")}`
          : "Year to date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <IconCalendar className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={applyRange}
          numberOfMonths={2}
          defaultMonth={fromDate ?? toDate}
          autoFocus
        />
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={resetToYearToDate}
          >
            Year to date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
