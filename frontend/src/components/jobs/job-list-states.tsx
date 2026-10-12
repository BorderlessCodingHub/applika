"use client";

import type { ReactNode, Ref } from "react";
import {
  BriefcaseBusinessIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SearchXIcon,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { JobListItemSkeleton } from "@/components/jobs/job-list-item";
import {
  JOBS_COPY,
  jobCountLabel,
  pageLabel,
} from "@/components/jobs/job-copy";
import { cn } from "@/lib/utils";

export function JobListSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-slot="job-list-loading"
      className={cn("flex flex-col gap-3", className)}
    >
      <span className="sr-only">{JOBS_COPY.loadingJobs}</span>
      {Array.from({ length: count }, (_, index) => (
        <JobListItemSkeleton key={index} />
      ))}
    </div>
  );
}

/** No job at all and no filter set. */
export function JobListEmpty({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={BriefcaseBusinessIcon}
      title={JOBS_COPY.emptyTitle}
      description={JOBS_COPY.emptyBody}
      className={className}
    />
  );
}

/** Filters set and nothing left. */
export function JobListNoMatches({
  onClearFilters,
  className,
}: {
  onClearFilters: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={SearchXIcon}
      title={JOBS_COPY.noMatchesTitle}
      description={JOBS_COPY.noMatchesBody}
      action={
        <Button type="button" variant="outline" onClick={onClearFilters}>
          {JOBS_COPY.clearFilters}
        </Button>
      }
      className={className}
    />
  );
}

export interface JobLoadErrorProps {
  title?: string;
  /** `h1` where the error is the whole page (the job view). */
  titleAs?: "p" | "h1" | "h2";
  /** The API's own message (`getApiError`). */
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  action?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A failed load, in `role="alert"`. Retry stays focusable while it spins
 * (`aria-disabled`, not `disabled`), so a keyboard user keeps their place.
 */
export function JobLoadError({
  title = JOBS_COPY.loadErrorTitle,
  titleAs: Title = "p",
  message,
  onRetry,
  isRetrying = false,
  action,
  className,
  ref,
}: JobLoadErrorProps) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      data-slot="job-load-error"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center outline-none",
        className,
      )}
    >
      <CircleAlertIcon aria-hidden className="size-6 text-destructive" />
      <div>
        <Title className="font-display text-base font-semibold text-foreground">
          {title}
        </Title>
        <p className="mt-1 max-w-md text-sm text-pretty text-foreground/80">
          {message}
        </p>
      </div>
      {onRetry || action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              aria-disabled={isRetrying || undefined}
              onClick={() => {
                if (!isRetrying) onRetry();
              }}
            >
              {isRetrying ? (
                <LoaderCircleIcon
                  aria-hidden
                  data-icon="inline-start"
                  className="motion-safe:animate-spin"
                />
              ) : (
                <RotateCcwIcon aria-hidden data-icon="inline-start" />
              )}
              {JOBS_COPY.retry}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** "142 jobs", announced politely as filters change; `tabIndex=-1` makes it the focus target after a page change or a dismissal. */
export function JobResultsCount({
  total,
  className,
  ref,
}: {
  total: number;
  className?: string;
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      data-slot="job-results-count"
      className={cn(
        "rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {jobCountLabel(total)}
    </p>
  );
}

export interface JobListPagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** 25 per page. Ends are `aria-disabled` so the button under focus never drops it. */
export function JobListPager({
  page,
  totalPages,
  onPageChange,
  className,
}: JobListPagerProps) {
  if (totalPages <= 1) return null;
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  return (
    <nav
      aria-label={JOBS_COPY.pagerLabel}
      data-slot="job-list-pager"
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border/60 pt-4",
        className,
      )}
    >
      <p
        aria-live="polite"
        className="font-numeric text-xs text-muted-foreground"
      >
        {pageLabel(page, totalPages)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={JOBS_COPY.previousPage}
          aria-disabled={atFirst || undefined}
          onClick={() => {
            if (!atFirst) onPageChange(page - 1);
          }}
          className="aria-disabled:opacity-50"
        >
          <ChevronLeftIcon aria-hidden data-icon="inline-start" />
          {JOBS_COPY.previous}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={JOBS_COPY.nextPage}
          aria-disabled={atLast || undefined}
          onClick={() => {
            if (!atLast) onPageChange(page + 1);
          }}
          className="aria-disabled:opacity-50"
        >
          {JOBS_COPY.next}
          <ChevronRightIcon aria-hidden data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}
