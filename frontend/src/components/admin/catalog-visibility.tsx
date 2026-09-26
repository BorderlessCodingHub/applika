"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** `all` sends no `visibility` param. */
export type CatalogVisibility = "all" | "public" | "private";

export const CATALOG_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: CatalogVisibility;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

export const CATALOG_VISIBILITY_LABEL = "Visibility";
export const ADDED_BY_LABEL = "Added by";
export const ADDED_BY_NONE_SR = "Not recorded";

export function visibilityParam(
  value: CatalogVisibility,
): "public" | "private" | undefined {
  return value === "all" ? undefined : value;
}

/**
 * All / Public / Private segmented control for the admin companies and
 * platforms tables. Radix `RadioGroup`, the `SalaryPeriodToggle` pattern:
 * arrow keys move, each segment is a labelled `radio`.
 */
export function VisibilityFilter({
  value,
  onValueChange,
  disabled,
  className,
}: {
  value: CatalogVisibility;
  onValueChange: (value: CatalogVisibility) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as CatalogVisibility)}
      disabled={disabled}
      aria-label={CATALOG_VISIBILITY_LABEL}
      orientation="horizontal"
      data-slot="visibility-filter"
      className={cn(
        "inline-flex h-8 w-fit items-center rounded-lg bg-muted p-[3px]",
        className,
      )}
    >
      {CATALOG_VISIBILITY_OPTIONS.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="h-full rounded-md px-3 text-xs font-medium text-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** The `created_by.username`, or a dash when the row has no recorded creator. */
export function AddedBy({
  username,
  className,
}: {
  username: string | null | undefined;
  className?: string;
}) {
  if (!username) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">{ADDED_BY_NONE_SR}</span>
      </span>
    );
  }
  return (
    <span
      data-slot="added-by"
      className={cn("block truncate text-foreground/80", className)}
    >
      {username}
    </span>
  );
}
