import { type ReactNode } from "react";
import { Banknote, Clock } from "lucide-react";

import { DeniedReasonBadge } from "@/components/timeline/denied-reason-badge";
import { EventTypeBadge } from "@/components/timeline/event-type-badge";
import { InterviewTypeBadge } from "@/components/timeline/interview-type-badge";
import {
  formatEventDate,
  formatOfferSalary,
  formatTimeRange,
} from "@/components/timeline/timeline-format";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface TimelineEventCardProps {
  /** Fully-typed event view-model. */
  event: TimelineEventView;
  /**
   * Row actions (e.g. an edit/delete `DropdownMenu` trigger). Rendered top-right.
   * Omit when the application is read-only.
   */
  actions?: ReactNode;
  className?: string;
}

/**
 * The content block of a single timeline entry: type badge (+ the interview
 * type on interviews, the reason on denied events) + date, an optional scheduled time range, the observation
 * text, and — for `offer` events — the salary. Presentational; the vertical
 * rail/dot is drawn by `TimelineEventList`.
 */
export function TimelineEventCard({
  event,
  actions,
  className,
}: TimelineEventCardProps) {
  const date = formatEventDate(event.eventDate);
  const timeRange = formatTimeRange(
    event.startTime,
    event.endTime,
    event.timezone,
  );
  const salary = event.type === "offer" ? formatOfferSalary(event) : null;
  const observation = event.observation?.trim();

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <EventTypeBadge type={event.type} />
            {event.type === "interview" ? (
              <InterviewTypeBadge type={event.interviewType} />
            ) : null}
            {event.type === "denied" ? (
              <DeniedReasonBadge reason={event.deniedReason} />
            ) : null}
            {date ? (
              <time
                dateTime={event.eventDate}
                className="font-numeric text-xs text-muted-foreground"
              >
                {date}
              </time>
            ) : null}
          </div>
          {timeRange ? (
            <p className="flex items-center gap-1.5 font-numeric text-xs text-muted-foreground">
              <Clock aria-hidden className="size-3 shrink-0" />
              {timeRange}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {observation ? (
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {observation}
        </p>
      ) : null}

      {salary ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 font-numeric text-sm font-medium text-success ring-1 ring-success/20">
          <Banknote aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">Offered salary: </span>
          {salary}
        </div>
      ) : null}
    </div>
  );
}
