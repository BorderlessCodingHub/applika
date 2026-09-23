"use client";

import { useId } from "react";
import { GitCompareArrows } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const CV_DIFF_TOGGLE_LABEL = "Show changes";

/** Said in place of the master's name once it is deleted and only the snapshot is left. */
export const CV_DIFF_ORIGINAL_MASTER = "the original master CV";

export function cvDiffCountLabel(count: number): string {
  if (count === 0) return "no changes";
  return count === 1 ? "1 change" : `${count} changes`;
}

export function cvDiffSummaryLabel(
  baselineLabel: string | null | undefined,
  count: number,
): string {
  const label = baselineLabel?.trim() || CV_DIFF_ORIGINAL_MASTER;
  return `Compared with ${label}: ${cvDiffCountLabel(count)}`;
}

export interface CvDiffSummaryBarProps {
  /** The master CV's name; `null` once it is deleted. */
  baselineLabel: string | null;
  count: number;
  showChanges: boolean;
  onShowChangesChange: (next: boolean) => void;
  className?: string;
}

export function CvDiffSummaryBar({
  baselineLabel,
  count,
  showChanges,
  onShowChangesChange,
  className,
}: CvDiffSummaryBarProps) {
  const switchId = useId();
  const summaryId = useId();

  return (
    <div
      data-slot="cv-diff-summary"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card px-4 py-3 shadow-sm",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <GitCompareArrows aria-hidden className="size-4" />
        </span>
        <p id={summaryId} className="min-w-0 text-sm text-pretty break-words">
          {cvDiffSummaryLabel(baselineLabel, count)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Switch
          id={switchId}
          checked={showChanges}
          onCheckedChange={onShowChangesChange}
          aria-describedby={summaryId}
        />
        <label
          htmlFor={switchId}
          className="cursor-pointer text-sm font-medium select-none"
        >
          {CV_DIFF_TOGGLE_LABEL}
        </label>
      </div>
    </div>
  );
}
