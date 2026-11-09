"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils";

const OptionValue = createContext<string | undefined>(undefined);

export interface PhoneOptionGroupProps {
  /** The id of the `.ph-lbl` heading that names the group. */
  labelledBy: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function PhoneOptionGroup({
  labelledBy,
  value,
  onValueChange,
  disabled,
  className,
  children,
}: PhoneOptionGroupProps) {
  return (
    <RadioGroup.Root
      data-slot="phone-option-group"
      aria-labelledby={labelledBy}
      orientation="vertical"
      value={value ?? ""}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn("flex flex-col gap-2", className)}
    >
      <OptionValue.Provider value={value}>{children}</OptionValue.Provider>
    </RadioGroup.Root>
  );
}

export interface PhoneOptionProps {
  value: string;
  /** The radio's whole accessible name. */
  title: ReactNode;
  /** Read as the radio's description. */
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function PhoneOption({
  value,
  title,
  hint,
  disabled,
  className,
}: PhoneOptionProps) {
  const checked = useContext(OptionValue) === value;
  const titleId = useId();
  const hintId = useId();
  return (
    <RadioGroup.Item
      value={value}
      disabled={disabled}
      aria-labelledby={titleId}
      aria-describedby={hint !== undefined ? hintId : undefined}
      className={cn("ph-opt", checked && "ph-on", className)}
    >
      <span className="ph-radio" aria-hidden="true" />
      <span className="flex flex-1 flex-col gap-0.5">
        <span id={titleId} className="text-[15px] font-semibold">
          {title}
        </span>
        {hint !== undefined ? (
          <span id={hintId} className="text-[13px] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </RadioGroup.Item>
  );
}
