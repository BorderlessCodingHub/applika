"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MONTH_YEAR_DISPLAY_FORMAT,
  isoToMonthYear,
  maskMonthYear,
  monthYearToIso,
} from "@/lib/month-year";
import { cn } from "@/lib/utils";

export interface MonthYearInputProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type"
> {
  /** ISO `YYYY-MM`, or `""`/`undefined` when empty. NOT what is displayed. */
  value?: string | null;
  /** ISO `YYYY-MM`, or `""` while the field is empty, partial or impossible. */
  onChange: (value: string) => void;
  /** Class for the positioning wrapper; `className` goes to the input itself. */
  wrapperClassName?: string;
}

/**
 * A month-and-year field: `MM/yyyy` on screen, ISO `YYYY-MM` on the wire.
 *
 * A TEXT input with a mask, not a calendar — a CV date has no day, and the
 * editor is driven from the keyboard end to end (`getByLabel("Start").fill("02/2023")`).
 * Digits are the only keys that count; the separator is inserted, and a whole
 * `MM/yyyy` pasted or filled in one go lands on the same value as six
 * keystrokes.
 *
 * Give it its accessible name from the outside — `CvField` wraps it in a
 * `<label>`, and the input is the only labelable node in here.
 */
export function MonthYearInput({
  value,
  onChange,
  placeholder = MONTH_YEAR_DISPLAY_FORMAT,
  className,
  wrapperClassName,
  ...props
}: MonthYearInputProps) {
  const iso = value ?? "";
  const display = isoToMonthYear(iso);
  const [draft, setDraft] = React.useState(display);

  // The draft is what the user sees, so a half-typed "02/20" survives the `""`
  // it emits. Re-sync only when the parent holds a date the draft does not
  // already spell — both conditions, or an unparseable `value` loops forever.
  if (display !== draft && monthYearToIso(draft) !== iso) {
    setDraft(display);
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={MONTH_YEAR_DISPLAY_FORMAT.length}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          const next = maskMonthYear(event.target.value);
          setDraft(next);
          onChange(monthYearToIso(next));
        }}
        className={cn("peer pl-9 tabular-nums", className)}
      />
      <CalendarIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </div>
  );
}
