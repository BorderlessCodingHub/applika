import { type ReactNode } from "react";
import { Banknote, Calendar, Clock } from "lucide-react";

import { IconTile } from "@/components/applications/icon-tile";
import { EventTypeBadge } from "@/components/timeline/event-type-badge";
import { InterviewTypeBadge } from "@/components/timeline/interview-type-badge";
import { DENIED_FEEDBACK_TITLE_PREFIX } from "@/components/timeline/timeline-copy";
import {
  DEFAULT_DENIED_REASON,
  DENIED_REASON_LABELS,
  EVENT_TYPE_CONFIG,
} from "@/components/timeline/timeline-options";
import {
  formatEventDate,
  formatOfferSalary,
  formatTimeRangeParts,
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
 * A single timeline entry: icon tile, type pill (+ interview type / denied
 * title), date, an optional scheduled time range, the observation text, and —
 * for `offer` events — the salary. Only a `denied` event tints the whole card
 * (image element index, KODI-015). Presentational.
 */
export function TimelineEventCard({
  event,
  actions,
  className,
}: TimelineEventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.type];
  const date = formatEventDate(event.eventDate);
  const timeRange = formatTimeRangeParts(
    event.startTime,
    event.endTime,
    event.timezone,
  );
  const salary = event.type === "offer" ? formatOfferSalary(event) : null;
  const observation = event.observation?.trim();
  const isDenied = event.type === "denied";
  const deniedReason = event.deniedReason ?? DEFAULT_DENIED_REASON;
  const showDeniedTitle = isDenied && deniedReason !== "unknown";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-3 sm:gap-6 sm:px-5",
        isDenied && "border-destructive/30 bg-destructive/5",
        className,
      )}
    >
      <IconTile
        icon={config.icon}
        size="md"
        className={cn(config.tileClass, "max-sm:size-10")}
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <EventTypeBadge type={event.type} hideIcon className="px-2.5" />
          {event.type === "interview" ? (
            <InterviewTypeBadge type={event.interviewType} />
          ) : null}
          {date ? (
            <span className="inline-flex items-center gap-1.5 font-numeric text-xs text-muted-foreground">
              <Calendar aria-hidden className="size-4 shrink-0" />
              <time dateTime={event.eventDate} className="whitespace-nowrap">
                {date}
              </time>
            </span>
          ) : null}
        </div>

        {showDeniedTitle ? (
          <p className="text-sm font-semibold text-foreground">
            {DENIED_FEEDBACK_TITLE_PREFIX}:{" "}
            <span>{DENIED_REASON_LABELS[deniedReason]}</span>
          </p>
        ) : null}

        {timeRange ? (
          <div className="flex flex-wrap items-center gap-x-1.5 font-numeric text-xs text-muted-foreground">
            <Clock aria-hidden className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{timeRange.range}</span>
            {timeRange.zone ? (
              <>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap">{timeRange.zone}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {observation ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {observation}
          </p>
        ) : null}

        {salary ? (
          <div className="inline-flex items-center gap-1.5 self-start rounded-md bg-success/10 px-2.5 py-1 font-numeric text-sm font-medium text-success ring-1 ring-success/20">
            <Banknote aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">Offered salary: </span>
            {salary}
          </div>
        ) : null}
      </div>

      {actions ? <div className="mt-1.5 shrink-0">{actions}</div> : null}
    </div>
  );
}
