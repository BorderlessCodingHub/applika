"use client";

import { useLocale } from "next-intl";

import { Fragment } from "react";

import { TIMELINE_COPY } from "@/components/timeline/timeline-copy";
import { DENIED_REASON_OPTIONS } from "@/components/timeline/timeline-options";
import { type DeniedReason } from "@/components/timeline/timeline-types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Unknown (the default) | the eight named reasons | Other — the catch-alls bracket the list.
const REASON_GROUPS = [
  DENIED_REASON_OPTIONS.filter((option) => option.value === "unknown"),
  DENIED_REASON_OPTIONS.filter(
    (option) => option.value !== "unknown" && option.value !== "other",
  ),
  DENIED_REASON_OPTIONS.filter((option) => option.value === "other"),
];

interface DeniedReasonSelectProps {
  /** Currently selected reason. New denied events and denied closes start at `unknown`. */
  value: DeniedReason;
  onValueChange: (value: DeniedReason) => void;
  disabled?: boolean;
  /** Trigger id; `<FormControl>` passes the one its `<FormLabel>` points at. */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Select for the 10 hardcoded denied reasons. Render it only for a `denied`
 * event or a `denied` close. Controlled + presentational.
 */
export function DeniedReasonSelect({
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: DeniedReasonSelectProps) {
  // The labels are read through the module translator: subscribe.
  useLocale();
  return (
    // `relative`: Radix renders a hidden native <select> at position: absolute.
    <div className={cn("relative", className)}>
      <Select
        value={value}
        onValueChange={(next) => onValueChange(next as DeniedReason)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-label={
            ariaLabelledby ? undefined : TIMELINE_COPY.deniedReasonLabel
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REASON_GROUPS.map((group, index) => (
            <Fragment key={group[0].value}>
              {index > 0 ? <SelectSeparator /> : null}
              <SelectGroup>
                {group.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </Fragment>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
