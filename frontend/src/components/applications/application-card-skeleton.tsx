import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ApplicationCardSkeletonProps {
  className?: string;
}

export function ApplicationCardSkeleton({
  className,
}: ApplicationCardSkeletonProps) {
  return (
    <div
      aria-hidden
      data-slot="application-card-skeleton"
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card sm:gap-5 sm:px-5 sm:py-3.5",
        className,
      )}
    >
      <Skeleton className="size-10 shrink-0 rounded-lg sm:size-12" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3.5 w-48 max-w-full" />
      </div>
      <Skeleton className="hidden h-4 w-24 xl:block" />
      <Skeleton className="hidden h-8 w-20 rounded-lg xl:block" />
      <Skeleton className="size-10 shrink-0" />
    </div>
  );
}
