"use client";

import { useId } from "react";
import { ArrowUpDown } from "lucide-react";

import type { TailoredCvAdjustment } from "@/components/tailored-cvs/types";
import { cn } from "@/lib/utils";

export const CV_DIFF_REORDERED_TITLE = "Reordered by job match";

export interface CvDiffAdjustmentsProps {
  /** The copy's `adjustments`; an empty list renders nothing. */
  adjustments: readonly TailoredCvAdjustment[];
  className?: string;
}

/**
 * The keyword tailoring's moves (R-025): a reorder is zero changes in the
 * diff, so the copy's own `adjustments` say what moved, verbatim.
 */
export function CvDiffAdjustments({
  adjustments,
  className,
}: CvDiffAdjustmentsProps) {
  const titleId = useId();

  if (adjustments.length === 0) return null;

  return (
    <div
      data-slot="cv-diff-adjustments"
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <p
        id={titleId}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <ArrowUpDown aria-hidden className="size-3.5 shrink-0 text-primary" />
        {CV_DIFF_REORDERED_TITLE}
      </p>
      <ul aria-labelledby={titleId} className="flex flex-col gap-1.5">
        {adjustments.map((adjustment, index) => (
          <li
            key={`${adjustment.section}-${index}`}
            data-section={adjustment.section}
            className="flex min-w-0 items-start gap-2 text-sm text-foreground"
          >
            <span
              aria-hidden
              className="mt-[0.4375rem] size-1.5 shrink-0 rounded-full bg-primary"
            />
            <span className="min-w-0 text-pretty break-words">
              {adjustment.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
