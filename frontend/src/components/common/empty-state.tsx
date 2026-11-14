import { type ComponentType, type ReactNode } from "react";
import { type LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Optional Lucide icon shown in a tinted tile above the title. */
  icon?: ComponentType<LucideProps>;
  /** Short headline describing the empty/zero state. */
  title: ReactNode;
  /** Optional supporting copy. */
  description?: ReactNode;
  /** Optional call-to-action (button/link) below the copy. */
  action?: ReactNode;
  className?: string;
}

/**
 * Centered empty/zero-data state used across feature screens (no results, first
 * run, cleared filters). Reuse for error and no-permission states by swapping
 * the icon and copy. Presentational.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon aria-hidden className="size-6" />
        </span>
      ) : null}
      <h3 className="font-display text-base font-semibold text-balance text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
