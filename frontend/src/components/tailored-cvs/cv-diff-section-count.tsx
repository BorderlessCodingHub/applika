import { cn } from "@/lib/utils";

export function cvDiffSectionCountLabel(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/** A section header's change count, for `CvSectionCard`'s `status` slot. Pass only a count above zero. */
export function CvDiffSectionCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      data-slot="cv-diff-count"
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full bg-primary/10 px-2 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
      {cvDiffSectionCountLabel(count)}
    </span>
  );
}
