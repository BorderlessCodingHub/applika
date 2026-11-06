"use client";

import type * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Text stays `foreground`: `text-primary` on its own tint is under 4.5:1 in light.
const SIZE_CLASS = {
  sm: "h-4.5 px-1.5 py-0 text-[11px] leading-none",
  default: "h-6 px-2.5 text-xs",
} as const;

export interface BetaBadgeProps extends Omit<
  React.ComponentProps<"span">,
  "children"
> {
  /** `sm` sits in a 13px nav row; `default` sits beside a page h1. */
  size?: keyof typeof SIZE_CLASS;
}

/** The word "Beta" on a feature still in beta; the tint only repeats it. */
export function BetaBadge({
  size = "default",
  className,
  ...props
}: BetaBadgeProps) {
  const t = useTranslations("features");
  return (
    <Badge
      variant="outline"
      data-slot="beta-badge"
      className={cn(
        "rounded-full border-primary/40 bg-primary-muted font-medium text-foreground",
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {t("beta")}
    </Badge>
  );
}
