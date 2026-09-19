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
      {/*
        Each tile decides its own divider via showDividerAtMd/showDividerAtXl
        (see computeDividerVisibility below) — a plain nth-child rule cannot
        tell a "first in row" tile from any other once a tile spans more than
        one column (Salary Range / Expected Salary / Notes), since the column
        a tile lands in then depends on every tile before it.
      */}
      <dl className="grid grid-cols-1 gap-x-10 gap-y-4 @md/details:grid-cols-2 @3xl/details:grid-cols-4">
        {children}
      </dl>
    </div>
  );
}

/**
 * A row-packing simulation for a CSS grid using the browser's own
 * sparse auto-placement algorithm (items are placed left to right, top to
 * bottom, and a row is never backfilled once the cursor has moved past it).
 * `spans[i]` is how many of `columns` tracks tile `i` occupies (an item
 * whose span reaches or exceeds `columns` always starts, and fills, its own
 * row). Returns, per tile, whether it is the FIRST tile in its row — the
 * only tiles that must not show a divider before them.
 */
export function computeDividerVisibility(
  spans: number[],
  columns: number,
): boolean[] {
  let cursor = 0;
  return spans.map((span) => {
    const effectiveSpan = Math.min(span, columns);
    if (cursor !== 0 && cursor + effectiveSpan > columns) {
      cursor = 0;
    }
    const isFirstInRow = cursor === 0;
    cursor += effectiveSpan;
    if (cursor >= columns) cursor = 0;
    return !isFirstInRow;
  });
}

interface ApplicationDetailTileProps {
  icon: ComponentType<LucideProps>;
  label: string;
  children: ReactNode;
  tone?: IconTileTone;
  /** Spans every column, e.g. free-text notes. */
  wide?: boolean;
  /**
   * Whether this tile should show its divider at the 2-column and 4-column
   * container breakpoints, from `computeDividerVisibility`. Defaults to
   * `true` (show) at both, matching a single-column tile that is never
   * first-in-row by construction unless told otherwise.
   */
  showDividerAtMd?: boolean;
  showDividerAtXl?: boolean;
  className?: string;
}

export function ApplicationDetailTile({
  icon,
  label,
  children,
  tone = "neutral",
  wide = false,
  showDividerAtMd = true,
  showDividerAtXl = true,
  className,
}: ApplicationDetailTileProps) {
  return (
    <div
      data-slot="application-detail-tile"
      className={cn(
        "relative flex min-h-10 min-w-0 flex-col justify-center pl-14 sm:min-h-12 sm:pl-16",
        "before:absolute before:inset-y-0 before:-left-5 before:hidden before:w-px before:bg-border",
        showDividerAtMd
          ? "@md/details:before:block"
          : "@md/details:before:hidden",
        showDividerAtXl
          ? "@3xl/details:before:block"
          : "@3xl/details:before:hidden",
        wide && "col-span-full before:hidden!",
        className,
      )}
    >
      <dt className="text-xs text-muted-foreground">
        <IconTile
          icon={icon}
          tone={tone}
          size="lg"
          className="absolute top-0 left-0 max-sm:size-10 max-sm:[&_svg]:size-5"
        />
        {label}
      </dt>
      <dd className="text-sm font-semibold break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}
