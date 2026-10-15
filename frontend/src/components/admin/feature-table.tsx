"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import {
  CircleAlert,
  EyeOff,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  Minus,
  RefreshCw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  FEATURE_COPY,
  FEATURE_LIST_COPY,
  featureAccessKind,
  featureAccessShort,
  featureHref,
  formatFeatureDate,
  type FeatureAccess,
  type FeatureAccessKind,
  type FeatureRow,
} from "@/components/admin/feature-copy";
import { FeatureStageBadge } from "@/components/admin/feature-stage-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FeatureStage } from "@/services/types/features";

export type FeatureListState = "loading" | "error" | "empty" | "ready";

export function featureListState({
  features,
  isLoading,
  isError,
}: {
  features: readonly FeatureRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}): FeatureListState {
  if (isLoading) return "loading";
  if (features) return features.length > 0 ? "ready" : "empty";
  return isError ? "error" : "loading";
}

export interface FeatureTableProps {
  features: readonly FeatureRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** Renders "Try again" on the error state when given. */
  onRetry?: () => void;
  isRetrying?: boolean;
  /** A background refetch: dims the rows. */
  isRefreshing?: boolean;
  className?: string;
}

const HEAD =
  "h-10 px-3 align-middle font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase";
const CELL = "px-3 py-3 align-top";

/** R-006 / AC1: one row per feature; the table scrolls sideways inside its own region, never the page. */
export function FeatureTable({
  features,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  isRefreshing = false,
  className,
}: FeatureTableProps) {
  const captionId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const retried = useRef(false);
  const state = featureListState({ features, isLoading, isError });

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state === "error" || state === "loading" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [state]);

  return (
    <Card
      ref={cardRef}
      tabIndex={-1}
      data-slot="features"
      data-state={state}
      className={cn("gap-0 overflow-hidden py-0 outline-none", className)}
    >
      {state === "loading" ? (
        <div role="status" className="flex flex-col divide-y divide-border">
          <span className="sr-only">{FEATURE_LIST_COPY.loading}</span>
          {[0, 1].map((row) => (
            <div
              key={row}
              aria-hidden
              className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4"
            >
              <Skeleton className="h-4 w-14" />
              <div className="flex w-56 flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : state === "error" ? (
        <div role="alert" className="p-4">
          <EmptyState
            icon={CircleAlert}
            title={FEATURE_LIST_COPY.loadErrorTitle}
            description={FEATURE_LIST_COPY.loadErrorBody}
            action={
              onRetry ? (
                <RetryButton
                  label={FEATURE_LIST_COPY.retry}
                  isRetrying={isRetrying}
                  onRetry={() => {
                    retried.current = true;
                    onRetry();
                  }}
                />
              ) : null
            }
          />
        </div>
      ) : state === "empty" ? (
        <div className="p-4">
          <EmptyState
            icon={FlaskConical}
            title={FEATURE_LIST_COPY.emptyTitle}
            description={FEATURE_LIST_COPY.emptyBody}
          />
        </div>
      ) : (
        // Focusable: no cell past the name link is (WCAG 2.1.1). `relative`: the sr-only spans would stretch the page.
        <div
          role="region"
          aria-labelledby={captionId}
          aria-busy={isRefreshing || undefined}
          tabIndex={0}
          data-slot="features-scroll"
          className={cn(
            "relative overflow-x-auto transition-opacity duration-200 outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
            isRefreshing && "opacity-60",
          )}
        >
          <table data-slot="table" className="w-full text-sm">
            <caption id={captionId} className="sr-only">
              {FEATURE_LIST_COPY.tableLabel}
            </caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className={cn(HEAD, "pl-4")}>
                  {FEATURE_LIST_COPY.columns.key}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {FEATURE_LIST_COPY.columns.name}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {FEATURE_LIST_COPY.columns.stage}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "text-right")}>
                  {FEATURE_LIST_COPY.columns.betaUsers}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {FEATURE_LIST_COPY.columns.released}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "pr-4")}>
                  {FEATURE_LIST_COPY.columns.you}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features?.map((feature) => (
                <FeatureTableRow key={feature.key} feature={feature} />
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FeatureTableRow({ feature }: { feature: FeatureRow }) {
  return (
    <TableRow
      data-slot="feature-row"
      data-feature-key={feature.key}
      data-stage={feature.stage}
      className="hover:bg-muted/30"
    >
      <TableCell className={cn(CELL, "pl-4 whitespace-normal")}>
        {/* Breaks at the key's hyphens; `break-words` keeps short keys whole (min-content). */}
        <div className="max-w-40">
          <FeatureKey value={feature.key} className="break-words" />
        </div>
      </TableCell>

      <TableHead
        scope="row"
        className={cn(CELL, "h-auto font-normal whitespace-normal")}
      >
        <div className="max-w-sm min-w-44 sm:min-w-56">
          <Link
            href={featureHref(feature.key)}
            data-slot="feature-link"
            className="rounded-sm font-display font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {feature.name}
          </Link>
          <FeatureDescription
            value={feature.description}
            className="mt-0.5 text-xs"
          />
        </div>
      </TableHead>

      <TableCell className={CELL}>
        <FeatureStageBadge stage={feature.stage} />
      </TableCell>

      <TableCell
        data-slot="feature-beta-count"
        className={cn(CELL, "text-right font-numeric text-foreground")}
      >
        {feature.beta_user_count.toLocaleString("en")}
      </TableCell>

      <TableCell className={cn(CELL, "whitespace-nowrap")}>
        <FeatureReleased
          stage={feature.stage}
          releasedAt={feature.released_at}
        />
      </TableCell>

      <TableCell className={cn(CELL, "pr-4")}>
        <FeatureAccessSummary me={feature.me} />
      </TableCell>
    </TableRow>
  );
}

const ACCESS_ICON: Record<
  FeatureAccessKind,
  { icon: LucideIcon; tone: string }
> = {
  general: { icon: Users, tone: "text-success" },
  list: { icon: ListChecks, tone: "text-primary" },
  admin: { icon: ShieldCheck, tone: "text-warning" },
  off: { icon: EyeOff, tone: "text-muted-foreground" },
  none: { icon: Minus, tone: "text-muted-foreground" },
};

/** The "You" cell: has it or not, and why, in words. The icon only repeats them. */
export function FeatureAccessSummary({
  me,
  className,
}: {
  me: FeatureAccess;
  className?: string;
}) {
  const kind = featureAccessKind(me);
  const { icon: Icon, tone } = ACCESS_ICON[kind];
  return (
    <span
      data-slot="feature-you"
      data-has={me.has}
      data-access={kind}
      className={cn(
        "flex items-start gap-2 whitespace-nowrap",
        me.has ? "text-foreground" : "text-foreground/70",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
      {featureAccessShort(me)}
    </span>
  );
}

/** The feature's key as written in code and in its URL. */
export function FeatureKey({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <code
      data-slot="feature-key"
      className={cn(
        "rounded-sm bg-muted/60 box-decoration-clone px-1.5 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
    >
      {value}
    </code>
  );
}

export function FeatureDescription({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  const text = value?.trim();
  return (
    <p
      data-slot="feature-description"
      className={cn(
        "text-pretty break-words text-muted-foreground",
        !text && "italic",
        className,
      )}
    >
      {text || FEATURE_COPY.noDescription}
    </p>
  );
}

/** "Oct 14, 2026" once released; "Not released" in beta. */
export function FeatureReleased({
  stage,
  releasedAt,
  className,
}: {
  stage: FeatureStage;
  releasedAt: string | null;
  className?: string;
}) {
  if (stage === "beta") {
    return (
      <span
        data-slot="feature-released"
        className={cn("text-muted-foreground", className)}
      >
        {FEATURE_COPY.notReleased}
      </span>
    );
  }
  if (!releasedAt) {
    return (
      <span
        data-slot="feature-released"
        className={cn("text-muted-foreground", className)}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">{FEATURE_COPY.notRecorded}</span>
      </span>
    );
  }
  return (
    <time
      data-slot="feature-released"
      dateTime={releasedAt}
      className={cn("font-numeric text-foreground", className)}
    >
      {formatFeatureDate(releasedAt)}
    </time>
  );
}

/** Pending keeps focus: aria-disabled, not disabled (KODI-048). */
export function RetryButton({
  label,
  isRetrying,
  onRetry,
}: {
  label: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={isRetrying || undefined}
      aria-busy={isRetrying || undefined}
      className="aria-disabled:opacity-60"
      onClick={() => {
        if (!isRetrying) onRetry();
      }}
    >
      {isRetrying ? (
        <LoaderCircle
          aria-hidden
          data-icon="inline-start"
          className="motion-safe:animate-spin"
        />
      ) : (
        <RefreshCw aria-hidden data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
