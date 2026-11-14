"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils";

const OptionValue = createContext<string | undefined>(undefined);

export interface PhoneOptionGroupProps {
  /** The id of the `.ph-lbl` heading that names the group. */
  labelledBy?: string;
  /** The group's name when no heading on screen names it (v2/Welcome). */
  label?: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function PhoneOptionGroup({
  labelledBy,
  label,
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
      aria-label={labelledBy ? undefined : label}
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
  /** `lg`: v2/Welcome's 16/14 type; the default is v2/StartApplication's 15/13. */
  size?: "default" | "lg";
  className?: string;
}

const OPTION_TEXT = {
  default: {
    body: "flex flex-1 flex-col gap-0.5",
    title: "text-[15px] font-semibold",
    hint: "text-[13px] text-muted-foreground",
  },
  lg: {
    body: "flex flex-1 flex-col gap-1",
    title: "text-[16px] font-semibold",
    hint: "text-[14px] leading-[1.45] text-muted-foreground",
  },
} as const;

export function PhoneOption({
  value,
  title,
  hint,
  disabled,
  size = "default",
  className,
}: PhoneOptionProps) {
  const text = OPTION_TEXT[size];
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
      <span className={text.body}>
        <span id={titleId} className={text.title}>
          {title}
        </span>
        {hint !== undefined ? (
          <span id={hintId} className={text.hint}>
            {hint}
          </span>
        ) : null}
      </span>
    </RadioGroup.Item>
  );
}
