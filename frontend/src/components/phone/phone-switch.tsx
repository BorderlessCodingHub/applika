"use client";

import type { ComponentProps } from "react";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";

export type PhoneSwitchProps = Omit<
  ComponentProps<typeof Switch.Root>,
  "children"
>;

/** Name it with `aria-label` (as the boards do) or `aria-labelledby`. */
export function PhoneSwitch({ className, ...props }: PhoneSwitchProps) {
  return (
    <Switch.Root
      data-slot="phone-switch"
      className={cn("ph-switch", className)}
      {...props}
    />
  );
}
