"use client";

import { useId } from "react";
import { GitCompareArrows } from "lucide-react";
import { useTranslations } from "next-intl";

import { CvDiffAdjustments } from "@/components/tailored-cvs/cv-diff-adjustments";
import type { TailoredCvAdjustment } from "@/components/tailored-cvs/types";
import { Switch } from "@/components/ui/switch";
import { word } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/** "no changes", "1 change", "3 changes" in the active language. */
export function cvDiffCountLabel(count: number): string {
  return word("cvs.diff.summaryCount", { count });
}

/**
 * "Compared with <master CV name>: 3 changes". The master's name is user
 * content and is never translated; once it is deleted and only the snapshot
 * is left, "the original master CV" stands in. A component rendering it also
 * subscribes (`useTranslations`).
 */
export function cvDiffSummaryLabel(
  baselineLabel: string | null | undefined,
  count: number,
): string {
  const label = baselineLabel?.trim() || word("cvs.diff.originalMaster");
  return word("cvs.diff.comparedWith", {
    label,
    count: cvDiffCountLabel(count),
  });
}

export interface CvDiffSummaryBarProps {
  /** The master CV's name; `null` once it is deleted. */
  baselineLabel: string | null;
  count: number;
  showChanges: boolean;
  onShowChangesChange: (next: boolean) => void;
  /** The copy's `adjustments`, listed under "Reordered by job match" while `showChanges` is on. */
  adjustments?: readonly TailoredCvAdjustment[];
  className?: string;
}

export function CvDiffSummaryBar({
  baselineLabel,
  count,
  showChanges,
  onShowChangesChange,
  adjustments,
  className,
}: CvDiffSummaryBarProps) {
  const t = useTranslations("cvs.diff");
  const switchId = useId();
  const summaryId = useId();
  const showAdjustments = showChanges && !!adjustments?.length;

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
          {t("showChanges")}
        </label>
      </div>
      {showAdjustments && adjustments ? (
        <CvDiffAdjustments
          adjustments={adjustments}
          className="basis-full border-t border-border/60 pt-3"
        />
      ) : null}
    </div>
  );
}
