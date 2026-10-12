import { cn } from "@/lib/utils";

export const CV_DIFF_SECTION_REORDERED = "reordered";

export function cvDiffSectionCountLabel(
  count: number,
  reordered = false,
): string {
  if (count <= 0) return reordered ? CV_DIFF_SECTION_REORDERED : "0 changes";
  const changes = count === 1 ? "1 change" : `${count} changes`;
  return reordered ? `${changes}, ${CV_DIFF_SECTION_REORDERED}` : changes;
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
