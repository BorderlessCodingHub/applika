"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneCheckOptionProps extends Omit<
  ComponentProps<"button">,
  "type" | "role" | "onChange" | "children"
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The option's name (600). */
  label: ReactNode;
  /** One muted line under it, read as the option's description. */
  description?: ReactNode;
  /** The group's choice is refused (no badge picked): the border turns red. */
  invalid?: boolean;
}

/**
 * v3/AdminWebhook's badge option (`.opt` + `.box`, l.46-49, l.121-124): a
 * `role="checkbox"` button, named by its label and described by its line,
 * toggled by tap, Enter or Space. At least 44px tall (14px padding around a
 * 20px box and two lines).
 */
export function PhoneCheckOption({
  checked,
  onCheckedChange,
  label,
  description,
  invalid = false,
  className,
  onClick,
  "aria-describedby": describedBy,
  ...props
}: PhoneCheckOptionProps) {
  const id = useId();
  const labelId = `${id}-l`;
  const descriptionId = `${id}-d`;
  const described =
    [description !== undefined ? descriptionId : null, describedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <button
      {...props}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={described}
      aria-invalid={invalid || undefined}
      data-slot="phone-check-option"
      className={cn("ph-opt ph-opt-chk", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
    >
      <span className="ph-box" aria-hidden="true">
        {checked ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span className="ph-opt-text">
        <span id={labelId} className="ph-opt-l">
          {label}
        </span>
        {description !== undefined ? (
          <span id={descriptionId} className="ph-opt-d">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
