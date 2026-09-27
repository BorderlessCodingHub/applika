"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, Clock, RefreshCw } from "lucide-react";

import {
  AGENDA_PAGE_COPY,
  AGENDA_TIMELINE_COPY,
  agendaTimelineCountLabel,
} from "@/components/agenda/agenda-copy";
import { IconTile } from "@/components/applications/icon-tile";
import { TIMELINE_PANEL_COPY } from "@/components/timeline/timeline-copy";
import { TimelineEventList } from "@/components/timeline/timeline-event-list";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AgendaCardTimelineStatus = "loading" | "error" | "success";

export interface AgendaCardTimelineProps {
  status: AgendaCardTimelineStatus;
  /** Region name, `agendaItemNames(role, company).timeline`. */
  label: string;
  /** Newest first (`toTimelineEventViews`). Read on `success` only. */
  events?: TimelineEventView[];
  /** `getApiError(error)`, shown verbatim on `error`. */
  errorDetail?: string;
  /** Omit to hide the Retry button. */
  onRetry?: () => void;
  /** A refetch after an error is in flight. */
  retrying?: boolean;
  className?: string;
}

function TimelineEventCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-3 sm:gap-6 sm:px-5"
    >
      <Skeleton className="size-11 shrink-0 rounded-lg max-sm:size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <Skeleton className="h-3.5 w-56 max-w-full" />
      </div>
    </div>
  );
}

export function AgendaCardTimeline({
  status,
  label,
  events = [],
  errorDetail,
  onRetry,
  retrying = false,
  className,
}: AgendaCardTimelineProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const retryClicked = useRef(false);

  useEffect(() => {
    if (status === "error" || !retryClicked.current) return;
    retryClicked.current = false;
    // Retry unmounted with focus on it: land on the region, never on <body>.
    const active = document.activeElement;
    if (active == null || active === document.body) {
      sectionRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  const count =
    status === "success" && events.length > 0 ? events.length : null;

  let body;
  if (status === "loading") {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{AGENDA_TIMELINE_COPY.loading}</span>
        <TimelineEventCardSkeleton />
        <TimelineEventCardSkeleton />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div
        data-slot="agenda-card-timeline-error"
        className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 @md/agenda-card:flex-row @md/agenda-card:items-center @md/agenda-card:gap-4"
      >
        {/* Role on the message, not the box, so "Retry" is not announced. */}
        <div role="alert" className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"
          >
            <CircleAlert className="size-4" />
          </span>
          <div className="min-w-0 flex-1 pt-1.5 @md/agenda-card:pt-0">
            <p className="text-sm font-medium text-foreground">
              {AGENDA_TIMELINE_COPY.loadErrorTitle}
            </p>
            <p className="mt-0.5 text-sm break-words text-foreground/80">
              {errorDetail?.trim() || AGENDA_TIMELINE_COPY.loadErrorFallback}
            </p>
          </div>
        </div>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={retrying || undefined}
            onClick={() => {
              if (retrying) return;
              retryClicked.current = true;
              onRetry();
            }}
            className="ml-11 self-start aria-disabled:opacity-50 @md/agenda-card:ml-0 @md/agenda-card:self-center"
          >
            <RefreshCw
              aria-hidden
              data-icon="inline-start"
              className={cn(retrying && "motion-safe:animate-spin")}
            />
            {AGENDA_PAGE_COPY.retry}
          </Button>
        ) : null}
      </div>
    );
  } else if (events.length === 0) {
    body = (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3 sm:gap-6 sm:px-5">
        <IconTile icon={Clock} size="md" className="max-sm:size-10" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {AGENDA_TIMELINE_COPY.emptyTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {AGENDA_TIMELINE_COPY.emptyDescription}
          </p>
        </div>
      </div>
    );
  } else {
    body = <TimelineEventList events={events} />;
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={label}
      data-slot="agenda-card-timeline"
      data-status={status}
      className={cn(
        // pl-20 = the card's time column (w-16) + its gap (gap-4).
        "flex animate-fade-in-up flex-col gap-4 outline-none motion-reduce:animate-none @lg/agenda-card:pl-20",
        className,
      )}
    >
      <Separator />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Clock
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h4 className="font-display text-sm font-semibold text-foreground">
              {TIMELINE_PANEL_COPY.title}
            </h4>
            {count != null ? (
              <span className="text-xs text-muted-foreground">
                {agendaTimelineCountLabel(count)}
              </span>
            ) : null}
          </div>
        </div>
        {body}
      </div>
    </section>
  );
}
