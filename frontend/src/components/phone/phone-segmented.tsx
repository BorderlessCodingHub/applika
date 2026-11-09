"use client";

import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export interface PhoneSegment<V extends string> {
  value: V;
  label: string;
  /** For an endonym ("Português (BR)" is `pt-BR`). */
  lang?: string;
}

export interface PhoneSegmentedProps<V extends string> {
  /** The id of the visible heading that names the group. */
  labelledBy: string;
  segments: readonly PhoneSegment<V>[];
  /** `undefined` checks none (the theme before next-themes resolves). */
  value: V | undefined;
  onValueChange: (value: V) => void;
  /** A change is applying: announced, never disabled (focus would drop). */
  busy?: boolean;
  className?: string;
}

export function PhoneSegmented<V extends string>({
  labelledBy,
  segments,
  value,
  onValueChange,
  busy = false,
  className,
}: PhoneSegmentedProps<V>) {
  return (
    <RadioGroup.Root
      data-slot="phone-segmented"
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      orientation="horizontal"
      value={value ?? ""}
      onValueChange={(next) => {
        const segment = segments.find((s) => s.value === next);
        if (segment) onValueChange(segment.value);
      }}
      className={cn("ph-seg", className)}
      style={{
        gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
      }}
    >
      {segments.map((segment) => (
        <RadioGroup.Item
          key={segment.value}
          value={segment.value}
          lang={segment.lang}
          className={cn(segment.value === value && "ph-on")}
        >
          <span className="max-w-full truncate">{segment.label}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
