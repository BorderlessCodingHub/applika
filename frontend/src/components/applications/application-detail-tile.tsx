import { type ComponentType, type ReactNode } from "react";
import { type LucideProps } from "lucide-react";

import {
  IconTile,
  type IconTileTone,
} from "@/components/applications/icon-tile";
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
      {/* The divider before a tile shows only when that tile is not first in its row. */}
      <dl className="grid grid-cols-1 gap-x-10 gap-y-4 @md/details:grid-cols-2 @3xl/details:grid-cols-4 @3xl/details:[&>*:not(:nth-child(4n+1))]:before:block @md/details:[&>*:nth-child(2n)]:before:block">
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

export function ApplicationDetailTile({
  icon,
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
        "relative flex min-h-10 min-w-0 flex-col justify-center pl-14 sm:min-h-12 sm:pl-16",
        "before:absolute before:inset-y-0 before:-left-5 before:hidden before:w-px before:bg-border",
        wide && "col-span-full before:hidden!",
        className,
      )}
    >
      <dt className="text-sm text-muted-foreground">
        <IconTile
          icon={icon}
          tone={tone}
          size="lg"
          className="absolute top-0 left-0 max-sm:size-10 max-sm:[&_svg]:size-5"
        />
        {label}
      </dt>
      <dd className="text-base font-semibold break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}
