import { type ReactNode } from "react";

import { TimelineEventCard } from "@/components/timeline/timeline-event-card";
import { EVENT_TYPE_CONFIG } from "@/components/timeline/timeline-options";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface TimelineEventListProps {
  /** Events, already sorted by the caller (typically newest first). */
  events: TimelineEventView[];
  /**
   * Per-event action slot (e.g. an edit/delete menu). Return `null` to render no
   * actions — pass `undefined`/omit when the application is read-only.
   */
  renderActions?: (event: TimelineEventView) => ReactNode;
  className?: string;
}

/**
 * Vertical timeline: an ordered list where each entry pairs an accent node dot
 * on a connecting rail with a `TimelineEventCard`. Semantic `<ol>`/`<li>` so the
 * sequence is announced to assistive tech. Presentational — pass sorted events;
 * the panel owns empty/read-only states.
 */
export function TimelineEventList({
  events,
  renderActions,
  className,
}: TimelineEventListProps) {
  return (
    <ol className={cn("relative", className)}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const { dotClass } = EVENT_TYPE_CONFIG[event.type];
        return (
          <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
            <div
              aria-hidden
              className="relative flex w-3 shrink-0 flex-col items-center"
            >
              <span
                className={cn(
                  "mt-3 size-3 shrink-0 rounded-full ring-4 ring-background",
                  dotClass,
                )}
              />
              {isLast ? null : (
                <span className="mt-1.5 w-px flex-1 bg-border" />
              )}
            </div>
            <TimelineEventCard
              event={event}
              actions={renderActions?.(event)}
              className="min-w-0 flex-1"
            />
          </li>
        );
      })}
    </ol>
  );
}
