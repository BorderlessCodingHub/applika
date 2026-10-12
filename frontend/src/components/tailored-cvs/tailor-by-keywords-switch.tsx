"use client";

import { useId } from "react";
import { ArrowUpDown } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const TAILOR_BY_KEYWORDS_LABEL = "Tailor by keywords";
export const TAILOR_BY_KEYWORDS_DESCRIPTION =
  "Reorders skills and bullets by how well they match the job description. No text is added or changed.";

export interface TailorByKeywordsSwitchProps {
  /** On sends `tailoring: "keywords"` with the create; off is the verbatim copy. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The opt-in "Tailor by keywords" choice for a new CV copy (R-026). Off by
 * default. The CALLER decides whether it exists: with a blank job description
 * it is not rendered at all, never shown off or disabled (Plan corrections 16).
 */
export function TailorByKeywordsSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: TailorByKeywordsSwitchProps) {
  const switchId = useId();
  const descriptionId = useId();

  return (
    <div
      data-slot="tailor-by-keywords"
      data-state={checked ? "on" : "off"}
      className={cn("flex min-w-0 items-start gap-3", className)}
    >
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <ArrowUpDown
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-colors",
              checked ? "text-primary" : "text-muted-foreground",
            )}
          />
          <label
            htmlFor={switchId}
            className={cn(
              "text-sm leading-5 font-medium select-none",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
          >
            {TAILOR_BY_KEYWORDS_LABEL}
          </label>
        </span>
        <p
          id={descriptionId}
          className="text-sm text-pretty text-muted-foreground"
        >
          {TAILOR_BY_KEYWORDS_DESCRIPTION}
        </p>
      </div>
    </div>
  );
}
