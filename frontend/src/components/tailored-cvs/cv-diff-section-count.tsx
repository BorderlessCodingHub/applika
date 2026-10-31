"use client";

import { useLocale } from "next-intl";

import { word } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * "3 changes", "reordered", "1 change, reordered", in the active language
 * (`cvs.diff.*`). A component rendering it also subscribes (`useLocale`).
 */
export function cvDiffSectionCountLabel(
  count: number,
  reordered = false,
): string {
  const reorderedWord = word("cvs.diff.reordered");
  if (count <= 0)
    return reordered
      ? reorderedWord
      : word("cvs.diff.sectionCount", { count: 0 });
  const changes = word("cvs.diff.sectionCount", { count });
  return reordered ? word("cvs.diff.countReordered", { changes }) : changes;
}

/**
 * A section header's change count, for `CvSectionCard`'s `status` slot. Pass a
 * count above zero, or `reordered` when the copy's `adjustments` name the section.
 */
export function CvDiffSectionCount({
  count,
  reordered = false,
  className,
}: {
  count: number;
  reordered?: boolean;
  className?: string;
}) {
  // Subscribes: the label is read through the module translator.
  useLocale();
  return (
    <span
      data-slot="cv-diff-count"
      data-reordered={reordered || undefined}
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full bg-primary/10 px-2 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
      {cvDiffSectionCountLabel(count, reordered)}
    </span>
  );
}
