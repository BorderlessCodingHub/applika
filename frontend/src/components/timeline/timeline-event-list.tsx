import { type ReactNode } from "react";

import { TimelineEventCard } from "@/components/timeline/timeline-event-card";
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
 * The event list: an ordered list of cards, newest first, with no rail or dot
 * (KODI-015 image element index — the timeline reads as a stack of cards, not
 * a vertical rail). Semantic `<ol>`/`<li>` so the sequence is still announced
 * to assistive tech. Presentational — pass sorted events; the panel owns
 * empty/read-only states.
 */
export function TimelineEventList({
  events,
  renderActions,
  className,
}: TimelineEventListProps) {
  return (
    <ol className={cn("flex flex-col gap-3", className)}>
      {events.map((event) => (
        <li key={event.id}>
          <TimelineEventCard event={event} actions={renderActions?.(event)} />
        </li>
      ))}
    </ol>
  );
}
