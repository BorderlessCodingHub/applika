"use client";

import { useId } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import {
  EVENT_TYPE_OPTIONS,
  type EventTypeChoice,
  type EventTypeOption,
} from "@/components/timeline/timeline-options";
import { cn } from "@/lib/utils";

interface EventTypeSelectorProps {
  /** Currently selected chip: an event type, or `none` in the close dialog. */
  value: EventTypeChoice;
  /** Fired with the newly selected chip's value. */
  onValueChange: (value: EventTypeChoice) => void;
  /**
   * The chips, in order. Defaults to `EVENT_TYPE_OPTIONS` (Interview, Offer,
   * Denied — Add event and Edit event); the close dialog passes
   * `CLOSE_TYPE_OPTIONS` (None, Offer, Denied).
   */
  options?: readonly EventTypeOption[];
  /**
   * Shows the picked chip's `hint` under the chips and adds it to the group's
   * description (`aria-describedby`). The close dialog turns it on, so the
   * user reads what closing with that choice does.
   */
  showHint?: boolean;
  /** The group's accessible name when no `aria-labelledby` is given. */
  label?: string;
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
 * Segmented, icon-led selector for the timeline event types — Interview,
 * Offer and Denied by default, or the close dialog's None, Offer and Denied
 * through `options`. Built on Radix `RadioGroup` so it is a true
 * `radiogroup` — arrow keys move the selection, each chip is a labelled
 * `radio`, and focus is managed for you. Each chip carries its icon + accent
 * tile so the choice reads by shape and colour, not colour alone. Controlled +
 * presentational — pass `value` / `onValueChange` from react-hook-form.
 *
 * `showHint` adds a line under the chips explaining the picked one, wired as
 * the group's description (the close dialog's outcome line).
 *
 * Responsive: 3 in a row at every width for both option sets; the chip's side
 * padding tightens below `sm` so "Interview" fits at 320px.
 */
export function EventTypeSelector({
  value,
  onValueChange,
  options = EVENT_TYPE_OPTIONS,
  showHint = false,
  label = "Event type",
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: EventTypeSelectorProps) {
  const hintId = useId();
  const hint = showHint
    ? options.find((option) => option.value === value)?.hint
    : undefined;
  const describedBy =
    [ariaDescribedby, hint ? hintId : undefined].filter(Boolean).join(" ") ||
    undefined;

  const group = (
    <RadioGroupPrimitive.Root
      id={id}
      value={value}
      onValueChange={(next) => onValueChange(next as EventTypeChoice)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-labelledby={ariaLabelledby}
      aria-describedby={describedBy}
      aria-label={ariaLabelledby ? undefined : label}
      className={cn("grid grid-cols-3 gap-2", !showHint && className)}
    >
      {options.map((option) => {
        const {
          value: type,
          label: optionLabel,
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
              "group flex min-w-0 flex-col items-center gap-2 rounded-lg border px-1.5 py-3 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3",
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
            <span className="text-xs font-medium">{optionLabel}</span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );

  if (!showHint) return group;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {group}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
