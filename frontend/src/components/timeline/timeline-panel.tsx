import { type ReactNode } from "react";
import { Clock, Lock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { TIMELINE_READ_ONLY_COPY } from "@/components/timeline/timeline-copy";
import { TimelineEventList } from "@/components/timeline/timeline-event-list";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TimelinePanelProps {
  /** Events, sorted by the caller (typically newest first). */
  events: TimelineEventView[];
  /**
   * Header action, e.g. the "Add event" `<Button>` that opens the dialog. When
   * `readOnly` is set, pass a disabled control (or omit) — the panel also shows a
   * read-only notice.
   */
  action?: ReactNode;
  /** Per-event action slot forwarded to each card. Omit when read-only. */
  renderActions?: (event: TimelineEventView) => ReactNode;
  /**
   * Blocks editing affordances and shows a notice. Set when the application is
   * CLOSED (finalized) or in an ARCHIVED cycle.
   */
  readOnly?: boolean;
  /**
   * Why the timeline is read-only, rendered in the notice. Pass a
   * `TIMELINE_READ_ONLY_COPY` entry; defaults to the `closed` one.
   */
  readOnlyReason?: ReactNode;
  /** Action shown inside the empty state (e.g. an "Add event" button). */
  emptyAction?: ReactNode;
  className?: string;
}

/**
 * Titled "Timeline" card, mounted in an application row's expansion. Renders
 * the vertical `TimelineEventList`, an empty state when there are no events,
 * and a read-only notice when the application is closed/archived: the header
 * `action`, every `renderActions` slot and the empty-state action are then
 * withheld. Presentational — the page owns data and the add/edit wiring.
 */
export function TimelinePanel({
  events,
  action,
  renderActions,
  readOnly = false,
  readOnlyReason = TIMELINE_READ_ONLY_COPY.closed,
  emptyAction,
  className,
}: TimelinePanelProps) {
  const hasEvents = events.length > 0;

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Timeline
          </h2>
          {readOnly ? null : action}
        </div>

        {readOnly ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface/50 px-3 py-2 text-xs text-muted-foreground">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{readOnlyReason}</span>
          </div>
        ) : null}

        {hasEvents ? (
          <TimelineEventList
            events={events}
            renderActions={readOnly ? undefined : renderActions}
            className="mt-5"
          />
        ) : (
          <EmptyState
            icon={Clock}
            title="No events yet"
            description={
              readOnly
                ? "There is no activity recorded for this application."
                : "Log interviews, notes, feedback, offers, and rejections to build the story of this application."
            }
            action={readOnly ? undefined : emptyAction}
            className="mt-4 border-none bg-transparent px-0 py-8"
          />
        )}
      </div>
    </Card>
  );
}
