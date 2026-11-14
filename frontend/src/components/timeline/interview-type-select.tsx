"use client";

import { useTranslations } from "next-intl";

import { useId } from "react";

import { TIMELINE_COPY } from "@/components/timeline/timeline-copy";
import { INTERVIEW_TYPE_OPTIONS } from "@/components/timeline/timeline-options";
import { type InterviewType } from "@/components/timeline/timeline-types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface InterviewTypeSelectProps {
  /** Currently selected interview type. New interviews start at `unknown`. */
  value: InterviewType;
  /** Fired with the newly selected type. */
  onValueChange: (value: InterviewType) => void;
  /**
   * Types the user may not pick, e.g. `initial_screening` when the application
   * already has one — minus the event being edited. Disabled, not hidden.
   */
  disabledValues?: readonly InterviewType[];
  /** Disable the whole control (e.g. while saving). */
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
 * Select for the 7 hardcoded interview types. Render it only for `interview`
 * events. An option in `disabledValues` stays listed, is announced as
 * unavailable, and — for `initial_screening` — a hint under the trigger says
 * why. Controlled + presentational.
 */
export function InterviewTypeSelect({
  value,
  onValueChange,
  disabledValues = [],
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: InterviewTypeSelectProps) {
  const t = useTranslations("timeline.form");
  const hintId = useId();
  const screeningTaken = disabledValues.includes("initial_screening");
  const describedBy =
    [ariaDescribedby, screeningTaken ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    // `relative`: Radix renders a hidden native <select> at position: absolute.
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <Select
        value={value}
        onValueChange={(next) => onValueChange(next as InterviewType)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledby}
          aria-describedby={describedBy}
          aria-label={ariaLabelledby ? undefined : t("interviewType")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {INTERVIEW_TYPE_OPTIONS.map((option) => {
              const taken = disabledValues.includes(option.value);
              return (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={taken}
                >
                  {option.label}
                  {taken ? (
                    <span className="text-xs text-muted-foreground">
                      · {TIMELINE_COPY.interviewTypeTaken}
                    </span>
                  ) : null}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {screeningTaken ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {TIMELINE_COPY.initialScreeningTaken}
        </p>
      ) : null}
    </div>
  );
}
