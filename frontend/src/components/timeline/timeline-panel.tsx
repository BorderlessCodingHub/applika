import { type ReactNode } from "react";
import { Clock, Lock } from "lucide-react";

import { IconTile } from "@/components/applications/icon-tile";
import { EmptyState } from "@/components/common/empty-state";
import {
  TIMELINE_PANEL_COPY,
  TIMELINE_READ_ONLY_COPY,
} from "@/components/timeline/timeline-copy";
import { TimelineEventList } from "@/components/timeline/timeline-event-list";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
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
 * Titled "Timeline" panel (KODI-015 reference image), mounted in an
 * application row's expansion. Flat below `sm`, bordered from `sm` up — the
 * card shell it sits in already carries the border at that width. Renders the
 * event list, an empty state when there are no events, and a read-only notice
 * when the application is closed/archived: the header `action`, every
 * `renderActions` slot and the empty-state action are then withheld.
 * Presentational — the section owns data and the add/edit wiring.
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
    <section
      className={cn(
        "flex flex-col gap-4 sm:rounded-xl sm:border sm:border-border sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Clock} size="sm" />
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              {TIMELINE_PANEL_COPY.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {TIMELINE_PANEL_COPY.description}
            </p>
          </div>
        </div>
        {readOnly ? null : action}
      </div>

      {readOnly ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{readOnlyReason}</span>
        </div>
      ) : null}

      {hasEvents ? (
        <TimelineEventList
          events={events}
          renderActions={readOnly ? undefined : renderActions}
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
          className="border-none bg-transparent px-0 py-8"
        />
      )}
    </section>
  );
}
