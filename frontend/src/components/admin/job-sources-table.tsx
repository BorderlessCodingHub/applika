"use client";

import { useEffect, useId, useRef } from "react";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  RadioTower,
  RefreshCw,
} from "lucide-react";
import { useLocale } from "next-intl";

import {
  JOB_SOURCES_COPY,
  formatJobLastRun,
  jobRunStatusLabel,
  jobSourceHost,
  jobSourceSwitchLabel,
  type JobRunStatus,
} from "@/components/admin/job-sources-copy";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIntlLocale } from "@/i18n/intl-locale";
import { cn } from "@/lib/utils";

/** `GET /admin/jobs/sources` row; structurally the service's `AdminJobSource`. */
export interface JobSourceRow {
  id: string;
  code: string;
  name: string;
  base_url: string;
  is_enabled: boolean;
  last_run_at: string | null;
  last_run_status: JobRunStatus | null;
  last_run_error: string | null;
  last_run_found: number | null;
  last_run_saved: number | null;
  active_jobs: number;
}

export type JobSourcesListState = "loading" | "error" | "empty" | "ready";

export function jobSourcesListState({
  sources,
  isLoading,
  isError,
}: {
  sources: readonly JobSourceRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}): JobSourcesListState {
  if (isLoading) return "loading";
  if (sources) return sources.length > 0 ? "ready" : "empty";
  return isError ? "error" : "loading";
}

export interface JobSourcesTableProps {
  sources: readonly JobSourceRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** Renders "Try again" on the error state when given. */
  onRetry?: () => void;
  isRetrying?: boolean;
  /** A background refetch (after Run now or a switch): dims the rows. */
  isRefreshing?: boolean;
  /** R-034. Not called while that source's own PATCH is pending. */
  onEnabledChange: (source: JobSourceRow, enabled: boolean) => void;
  /** Ids whose PATCH is in flight; their switch shows the requested value via `sources`. */
  pendingIds?: readonly string[];
  /** "Today"/"Yesterday" are relative to this. */
  now?: Date;
  className?: string;
}

const HEAD =
  "h-10 px-3 align-middle font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase";
const CELL = "px-3 py-3 align-top";

/** R-033: one row per source; the table scrolls sideways inside its own region, never the page. */
export function JobSourcesTable({
  sources,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  isRefreshing = false,
  onEnabledChange,
  pendingIds = [],
  now,
  className,
}: JobSourcesTableProps) {
  const captionId = useId();
  // Subscribes: JOB_SOURCES_COPY and the dates read the active language at render.
  useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const retried = useRef(false);
  const state = jobSourcesListState({ sources, isLoading, isError });

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
      data-slot="job-sources"
      data-state={state}
      className={cn("gap-0 overflow-hidden py-0 outline-none", className)}
    >
      {state === "loading" ? (
        <div role="status" className="flex flex-col divide-y divide-border">
          <span className="sr-only">{JOB_SOURCES_COPY.loading}</span>
          {[0, 1].map((row) => (
            <div
              key={row}
              aria-hidden
              className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4"
            >
              <div className="flex w-36 flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-[1.15rem] w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : state === "error" ? (
        <div role="alert" className="p-4">
          <EmptyState
            icon={CircleAlert}
            title={JOB_SOURCES_COPY.loadErrorTitle}
            description={JOB_SOURCES_COPY.loadErrorBody}
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-disabled={isRetrying || undefined}
                  aria-busy={isRetrying || undefined}
                  className="aria-disabled:opacity-60"
                  onClick={() => {
                    if (isRetrying) return;
                    retried.current = true;
                    onRetry();
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
                  {JOB_SOURCES_COPY.retry}
                </Button>
              ) : null
            }
          />
        </div>
      ) : state === "empty" ? (
        <div className="p-4">
          <EmptyState
            icon={RadioTower}
            title={JOB_SOURCES_COPY.emptyTitle}
            description={JOB_SOURCES_COPY.emptyBody}
          />
        </div>
      ) : (
        // Focusable: no cell past the switches is (WCAG 2.1.1). `relative`: the sr-only "None" spans would stretch the page.
        <div
          role="region"
          aria-labelledby={captionId}
          aria-busy={isRefreshing || undefined}
          tabIndex={0}
          data-slot="job-sources-scroll"
          className={cn(
            "relative overflow-x-auto transition-opacity duration-200 outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
            isRefreshing && "opacity-60",
          )}
        >
          <table data-slot="table" className="w-full text-sm">
            <caption id={captionId} className="sr-only">
              {JOB_SOURCES_COPY.tableLabel}
            </caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className={cn(HEAD, "pl-4")}>
                  {JOB_SOURCES_COPY.columns.source}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {JOB_SOURCES_COPY.columns.enabled}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {JOB_SOURCES_COPY.columns.lastRun}
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  {JOB_SOURCES_COPY.columns.status}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "text-right")}>
                  {JOB_SOURCES_COPY.columns.found}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "text-right")}>
                  {JOB_SOURCES_COPY.columns.saved}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "text-right")}>
                  {JOB_SOURCES_COPY.columns.listed}
                </TableHead>
                <TableHead scope="col" className={cn(HEAD, "pr-4")}>
                  {JOB_SOURCES_COPY.columns.lastError}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources?.map((source) => (
                <JobSourceTableRow
                  key={source.id}
                  source={source}
                  pending={pendingIds.includes(source.id)}
                  onEnabledChange={onEnabledChange}
                  now={now}
                />
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </Card>
  );
}

function JobSourceTableRow({
  source,
  pending,
  onEnabledChange,
  now,
}: {
  source: JobSourceRow;
  pending: boolean;
  onEnabledChange: (source: JobSourceRow, enabled: boolean) => void;
  now?: Date;
}) {
  useLocale();
  return (
    <TableRow
      data-slot="job-source-row"
      data-source-code={source.code}
      data-enabled={source.is_enabled}
      className="hover:bg-transparent"
    >
      <TableHead
        scope="row"
        className={cn(CELL, "h-auto pl-4 font-normal whitespace-normal")}
      >
        <span className="block font-display font-semibold text-foreground">
          {source.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {jobSourceHost(source.base_url)}
        </span>
      </TableHead>

      <TableCell className={CELL}>
        <span className="flex h-5 items-center gap-2">
          {/* Pending keeps focus: aria-disabled, not disabled (KODI-048). */}
          <Switch
            checked={source.is_enabled}
            aria-label={jobSourceSwitchLabel(source.name)}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            data-slot="job-source-switch"
            onCheckedChange={(next) => {
              if (!pending) onEnabledChange(source, next);
            }}
            className="aria-disabled:cursor-progress aria-disabled:opacity-60"
          />
          {pending ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 text-muted-foreground motion-safe:animate-spin"
            />
          ) : null}
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "font-numeric text-foreground")}>
        {source.last_run_at ? (
          <time dateTime={source.last_run_at}>
            {formatJobLastRun(source.last_run_at, now)}
          </time>
        ) : (
          <span className="font-sans text-muted-foreground">
            {JOB_SOURCES_COPY.never}
          </span>
        )}
      </TableCell>

      <TableCell className={CELL}>
        <JobRunOutcome status={source.last_run_status} />
      </TableCell>

      <NumberCell value={source.last_run_found} />
      <NumberCell value={source.last_run_saved} />
      <NumberCell value={source.active_jobs} />

      <TableCell className={cn(CELL, "pr-4 whitespace-normal")}>
        <div className="max-w-sm min-w-56">
          {source.last_run_error ? (
            <p
              data-slot="job-source-error"
              className="text-sm wrap-anywhere whitespace-pre-wrap text-foreground/80"
            >
              {source.last_run_error}
            </p>
          ) : (
            <Missing />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

const OUTCOME: Record<
  JobRunStatus,
  { icon: typeof CircleCheck; tone: string }
> = {
  ok: { icon: CircleCheck, tone: "bg-success/10 [&>svg]:text-success" },
  failed: {
    icon: CircleX,
    tone: "bg-destructive/10 [&>svg]:text-destructive",
  },
  blocked: { icon: Ban, tone: "bg-warning/10 [&>svg]:text-warning" },
};

/** Words carry the outcome; tone text on its tint is under 4.5:1, so the text stays `foreground`. */
export function JobRunOutcome({ status }: { status: JobRunStatus | null }) {
  useLocale();
  if (!status) {
    return (
      <span
        data-slot="job-source-outcome"
        data-status="none"
        className="text-sm text-muted-foreground"
      >
        {jobRunStatusLabel(null)}
      </span>
    );
  }
  const { icon: Icon, tone } = OUTCOME[status];
  return (
    <Badge
      variant="secondary"
      data-slot="job-source-outcome"
      data-status={status}
      className={cn(
        "h-6 gap-1.5 rounded-full px-2 text-xs font-medium text-foreground [&>svg]:size-3.5",
        tone,
      )}
    >
      <Icon aria-hidden />
      {jobRunStatusLabel(status)}
    </Badge>
  );
}

function NumberCell({ value }: { value: number | null }) {
  const locale = useIntlLocale();
  return (
    <TableCell className={cn(CELL, "text-right font-numeric text-foreground")}>
      {value === null ? <Missing /> : value.toLocaleString(locale)}
    </TableCell>
  );
}

function Missing() {
  useLocale();
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">{JOB_SOURCES_COPY.none}</span>
    </span>
  );
}
