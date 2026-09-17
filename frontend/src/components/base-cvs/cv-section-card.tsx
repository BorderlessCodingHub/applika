import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface CvSectionCardProps {
  /** Section title. Rendered as the heading given by `as`. */
  title: string;
  /** Supporting copy under the title. */
  description?: ReactNode;
  /** Lucide icon shown in a tinted tile beside the title. */
  icon?: ComponentType<LucideProps>;
  /** Right-aligned header slot (the repeatable sections put their Add button here). */
  action?: ReactNode;
  /** Heading level, so the page outline stays correct. */
  as?: "h2" | "h3";
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Card shell for one titled block of the CV editor: tinted icon tile, heading,
 * description, an optional header action and the fields underneath. Shell only
 * — the caller owns the `<form>` and the fields.
 */
export function CvSectionCard({
  title,
  description,
  icon: Icon,
  action,
  as: Heading = "h2",
  children,
  className,
  contentClassName,
}: CvSectionCardProps) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex flex-row items-start gap-3 border-b border-border p-4">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon aria-hidden className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <Heading className="font-display text-base leading-none font-semibold tracking-tight">
            {title}
          </Heading>
          {description ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </Card>
  );
}
