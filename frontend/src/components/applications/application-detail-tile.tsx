import { type ComponentType, type ReactNode } from "react";
import { type LucideProps } from "lucide-react";

import { type IconTileTone } from "@/components/applications/icon-tile";
import { cn } from "@/lib/utils";

interface ApplicationDetailsPanelProps {
  children: ReactNode;
  className?: string;
}

export function ApplicationDetailsPanel({
  children,
  className,
}: ApplicationDetailsPanelProps) {
  return (
    <div
      data-slot="application-details-panel"
      className={cn(
        "@container/details rounded-xl border border-border bg-surface-elevated p-4 sm:p-5",
        className,
      )}
    >
      <dl className="grid grid-cols-1 gap-x-2 gap-y-4 @md/details:grid-cols-2 @3xl/details:grid-cols-4">
        {children}
      </dl>
    </div>
  );
}

interface ApplicationDetailTileProps {
  icon: ComponentType<LucideProps>;
  label: string;
  children: ReactNode;
  tone?: IconTileTone;
  /** Spans every column, e.g. free-text notes. */
  wide?: boolean;
  className?: string;
}

/** Icon colour per tone, without the rounded square of `IconTile`. */
const ICON_TONE_CLASS: Record<IconTileTone, string> = {
  neutral: "text-foreground/80",
  primary: "text-primary",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function ApplicationDetailTile({
  icon: Icon,
  label,
  children,
  tone = "neutral",
  wide = false,
  className,
}: ApplicationDetailTileProps) {
  return (
    <div
      data-slot="application-detail-tile"
      className={cn(
        "relative flex min-h-10 min-w-0 flex-col justify-center pl-9",
        wide && "col-span-full",
        className,
      )}
    >
      <dt className="text-xs text-muted-foreground">
        <Icon
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-0 size-6 -translate-y-1/2",
            ICON_TONE_CLASS[tone],
          )}
        />
        {label}
      </dt>
      <dd className="text-sm font-semibold break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}
