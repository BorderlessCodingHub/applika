"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerInputProps {
  value?: string;
  pattern?: string;
  onChange: (date: string | undefined) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
}

/**
 * DatePickerInput Component
 *
 * A reusable date picker component that can be used with react-hook-form.
 * Supports optional min/max date constraints and custom disabled date logic.
 *
 * @param value - The selected date string (yyyy-MM-dd)
 * @param pattern - Optional date pattern used in onChange (default: yyyy-MM-dd)
 * @param onChange - Callback when date changes
 * @param placeholder - Placeholder text
 * @param minDate - Optional minimum selectable date
 * @param maxDate - Optional maximum selectable date
 * @param disabled - Optional function to disable specific dates
 * @param className - Optional CSS class
 */
export function DatePickerInput({
  value,
  pattern = "yyyy-MM-dd",
  onChange,
  placeholder = "Pick a date",
  minDate,
  maxDate,
  disabled,
  className,
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);

  const isDateDisabled = (date: Date) => {
    // Check min date
    if (minDate && date < minDate) {
      return true;
    }
    // Check max date
    if (maxDate && date > maxDate) {
      return true;
    }
    return false;
  };

  const formatDate = (value: string) => parse(value, "yyyy-MM-dd", new Date());

  const toDate = value ? formatDate(value) : undefined;

  function onOpenChange() {
    if (!disabled) {
      setOpen((v) => !v);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={disabled ? "ghost" : "outline"}
          className={cn(
            "bg-card w-full justify-start text-left font-normal",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(formatDate(value), pattern) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={toDate}
          defaultMonth={toDate}
          onSelect={(date) => {
            onChange(date ? format(date, pattern) : undefined);
            setOpen(false);
          }}
          disabled={isDateDisabled}
          className={cn("bg-card", className)}
        />
      </PopoverContent>
    </Popover>
  );
}
