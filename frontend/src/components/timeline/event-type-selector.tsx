"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { EVENT_TYPE_OPTIONS } from "@/components/timeline/timeline-options";
import { type TimelineEventType } from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface EventTypeSelectorProps {
  /** Currently selected event type. */
  value: TimelineEventType;
  /** Fired with the newly selected type. */
  onValueChange: (value: TimelineEventType) => void;
  /** Disable the whole group (e.g. while saving, or read-only application). */
  disabled?: boolean;
  /** Marks the group invalid for styling + a11y (wire to your field error). */
  "aria-invalid"?: boolean;
  /** Associates a visible `<FormLabel>` with the group. */
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
  id?: string;
  className?: string;
}

/**
 * Segmented, icon-led selector for the 5 timeline event types.
 * Built on Radix `RadioGroup` so it is a true `radiogroup` — arrow keys move the
 * selection, each chip is a labelled `radio`, and focus is managed for you. Each
 * chip carries its type's icon + accent tile so the choice reads by shape and
 * colour, not colour alone. Controlled + presentational — pass `value` /
 * `onValueChange` from react-hook-form.
 *
 * Responsive: 2 columns on mobile, 3 from `sm`, all 5 in a row from `lg`.
 */
export function EventTypeSelector({
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: EventTypeSelectorProps) {
  return (
    <RadioGroupPrimitive.Root
      id={id}
      value={value}
      onValueChange={(next) => onValueChange(next as TimelineEventType)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-label={ariaLabelledby ? undefined : "Event type"}
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {EVENT_TYPE_OPTIONS.map((option) => {
        const {
          value: type,
          label,
          icon: Icon,
          tileClass,
          selectedClass,
        } = option;
        const selected = value === type;
        return (
          <RadioGroupPrimitive.Item
            key={type}
            value={type}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? selectedClass
                : "border-border text-muted-foreground hover:border-border-strong hover:bg-accent/40",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-9 items-center justify-center rounded-md ring-1",
                tileClass,
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className="text-xs font-medium">{label}</span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
