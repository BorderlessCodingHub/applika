import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";

export function FormSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-4 py-6 px-4 sm:px-0">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-52 w-full rounded-lg" />
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <p className="text-2xl font-display font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  iconClass,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  iconClass?: string;
}) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <Icon
        className={cn("h-4 w-4 mt-0.5 shrink-0", iconClass ?? "text-primary")}
      />
      <div>
        <h3 className="text-sm font-display font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

export function CharCounter({ count, max }: { count: number; max: number }) {
  const exceeded = count > max;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        exceeded ? "text-destructive font-medium" : "text-muted-foreground",
      )}
    >
      {exceeded ? `${count - max} over limit` : `${max - count} characters`}
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1.5">{message}</p>;
}
