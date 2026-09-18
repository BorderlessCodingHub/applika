"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { OFFER_SALARY_PERIOD_OPTIONS } from "@/components/timeline/timeline-options";
import {
  type OfferSalaryPeriod,
  type SalaryPeriod,
} from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface SalaryPeriodToggleProps {
  /**
   * Currently selected period (`monthly` | `annually`). A legacy `hourly` value
   * renders with nothing selected, so the user has to pick one of the two.
   */
  value: SalaryPeriod | "";
  /** Fired with the newly selected period. */
  onValueChange: (value: OfferSalaryPeriod) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
  id?: string;
  className?: string;
}

/**
 * Two-option segmented control for the Offer salary period (`monthly |
 * annually`). Built on Radix `RadioGroup` for full keyboard + a11y (arrow keys
 * switch, each half is a labelled `radio`). Controlled + presentational — wire
 * `value` / `onValueChange` from react-hook-form. Only render this for `offer`
 * events.
 */
export function SalaryPeriodToggle({
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: SalaryPeriodToggleProps) {
  const selected: OfferSalaryPeriod | undefined =
    value === "monthly" || value === "annually" ? value : undefined;

  return (
    <RadioGroupPrimitive.Root
      id={id}
      value={selected}
      onValueChange={(next) => onValueChange(next as OfferSalaryPeriod)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-label={ariaLabelledby ? undefined : "Salary period"}
      className={cn(
        "inline-flex h-9 w-full items-center rounded-lg bg-muted p-[3px]",
        className,
      )}
    >
      {OFFER_SALARY_PERIOD_OPTIONS.map((option) => {
        const isSelected = selected === option.value;
        return (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "h-full flex-1 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
