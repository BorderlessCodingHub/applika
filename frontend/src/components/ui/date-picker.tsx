"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { dateFnsLocale } from "@/i18n/date-locale";
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
  /** Trigger id; `<FormControl>` passes the one its `<FormLabel>` points at. */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
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
 * @param placeholder - Placeholder text (default `common.pickDate`)
 * @param minDate - Optional minimum selectable date
 * @param maxDate - Optional maximum selectable date
 * @param disabled - Optional function to disable specific dates
 * @param className - Optional CSS class
 */
export function DatePickerInput({
  value,
  pattern = "yyyy-MM-dd",
  onChange,
  placeholder,
  minDate,
  maxDate,
  disabled,
  className,
  id,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations("common");
  // The trigger writes the date the way the active language does; the value
  // handed to `onChange` keeps `pattern`, language-free.
  const locale = dateFnsLocale(useLocale());

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

  const formatDate = (value: string) => parse(value, pattern, new Date());

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
          data-slot="date-picker-trigger"
          id={id}
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          variant={disabled ? "ghost" : "outline"}
          className={cn(
            "w-full justify-start bg-card text-left font-normal",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value
            ? format(formatDate(value), pattern, { locale })
            : (placeholder ?? t("pickDate"))}
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
