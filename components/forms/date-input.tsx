"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  /** Shown on the trigger when no date is selected. */
  placeholder?: string;
  /**
   * Which days the calendar refuses. Named `disabledDates` rather than
   * `disabled` so it can't be confused with disabling the trigger itself.
   */
  disabledDates?: (date: Date) => boolean;
  /** Adds an X button that clears the value back to undefined. */
  clearable?: boolean;
  /**
   * react-day-picker's single mode reports `undefined` when the already-
   * selected day is clicked again. Set this on a required field to ignore
   * that and keep the current value.
   */
  keepValueOnDeselect?: boolean;
  iconPosition?: "leading" | "trailing";
  /** Layout classes for the trigger button (width, padding, alignment). */
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

/**
 * The date trigger on its own — a button that opens a single-date calendar.
 *
 * Pair it with DateField inside a react-hook-form form; use it directly only
 * where the surrounding FormItem/FormLabel are supplied by something else
 * (see app/lib/dynamic-form-field.tsx).
 */
export function DateInput({
  value,
  onChange,
  placeholder = "Pick a date",
  disabledDates,
  clearable = false,
  keepValueOnDeselect = false,
  iconPosition = "trailing",
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DateInputProps) {
  const icon = (
    <CalendarIcon
      className={cn(
        "h-4 w-4 opacity-50",
        iconPosition === "trailing" ? "ml-auto" : "mr-2",
      )}
    />
  );

  const trigger = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          type="button"
          variant="outline"
          className={cn(
            "text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {iconPosition === "leading" && icon}
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
          {iconPosition === "trailing" && icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (!date && keepValueOnDeselect) return;
            onChange(date);
          }}
          disabled={disabledDates}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );

  if (!clearable) return trigger;

  return (
    <div className="flex items-center gap-2">
      {trigger}
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => onChange(undefined)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
