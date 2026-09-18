"use client";

import { useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { Clock, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { IconTile } from "@/components/applications/icon-tile";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TimelineEventActionsMenu } from "@/components/timeline/timeline-event-actions-menu";
import {
  TIMELINE_PANEL_COPY,
  TIMELINE_READ_ONLY_COPY,
} from "@/components/timeline/timeline-copy";
import { TimelineEventForm } from "@/components/timeline/timeline-event-form";
import { formatEventDate } from "@/components/timeline/timeline-format";
import { stageLabel } from "@/components/timeline/timeline-options";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCycleContext } from "@/contexts/cycle-context";
import { useDeleteTimelineEvent } from "@/hooks/use-delete-timeline-event";
import { useTimeline } from "@/hooks/use-timeline";
import { getApiError } from "@/lib/api-client";
import { toTimelineEventViews } from "@/lib/timeline-view";
import { cn } from "@/lib/utils";
import type { Application } from "@/services/types/applications";

interface TimelineSectionProps {
  /** The application whose timeline this renders (raw DTO, for status guards). */
  application: Application;
  className?: string;
}

/**
 * Data-wired timeline region mounted inline in an application row's expansion
 * (PRD 0008, ADR 0012). Loads the application's events, maps + sorts them
 * newest-first, and feeds the presentational `TimelinePanel`. Owns the
 * add/edit dialog and the delete confirmation. The panel is read-only when the
 * application is CLOSED (`finalized_at`) or the user is viewing an ARCHIVED
 * past cycle — a matching notice explains why and all editing affordances are
 * withheld.
 *
 * Ported from mynextjob's `timeline-section.tsx`. Adapted: mynextjob derives
 * "archived" from `application.cycle_id`, a field applika's `Application` does
 * not carry on the wire — applika already established (tailored-cvs, see
 * `frontend/CLAUDE.md`) that "archived" is only knowable from the cycle
 * currently being VIEWED, via `useCycleContext().isViewingPastCycle`. This
 * follows that existing convention instead of inventing a second one.
 */
export function TimelineSection({
  application,
  className,
}: TimelineSectionProps) {
  const applicationId = application.id;
  const { isViewingPastCycle } = useCycleContext();
  const { data, isPending, isError, refetch, isFetching } =
    useTimeline(applicationId);
  const deleteEvent = useDeleteTimelineEvent();

  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEventView | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<TimelineEventView | null>(
    null,
  );

  const isArchived = isViewingPastCycle;
  const isClosed = application.finalized_at != null;
  const readOnly = isArchived || isClosed;
  const readOnlyReason = isArchived
    ? TIMELINE_READ_ONLY_COPY.archived
    : TIMELINE_READ_ONLY_COPY.closed;

  const events = useMemo(() => toTimelineEventViews(data ?? []), [data]);

  const openCreate = () => {
    setEditingEvent(null);
    setFormOpen(true);
  };

  const openEdit = (event: TimelineEventView) => {
    setEditingEvent(event);
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteEvent.mutate(
      { applicationId, eventId: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("Event deleted");
          setDeleteTarget(null);
        },
        onError: (error) => {
          toast.error(
            isAxiosError(error)
              ? getApiError(error)
              : "Could not delete the event",
          );
          setDeleteTarget(null);
        },
      },
    );
  };

  if (isPending) {
    return (
      <section
        aria-busy="true"
        className={cn(
          "flex flex-col gap-4 sm:rounded-xl sm:border sm:border-border sm:p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-[4.25rem] w-full rounded-lg" />
        <Skeleton className="h-[4.25rem] w-full rounded-lg" />
      </section>
    );
  }

  if (isError) {
    return (
      <section
        className={cn(
          "flex flex-col gap-4 sm:rounded-xl sm:border sm:border-border sm:p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <IconTile icon={Clock} size="sm" />
          <h2 className="font-display text-base font-semibold text-foreground">
            {TIMELINE_PANEL_COPY.title}
          </h2>
        </div>
        <EmptyState
          icon={RefreshCw}
          title="We couldn't load the timeline"
          description="Something went wrong fetching this application's events."
          action={
            <Button
              onClick={() => {
                void refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw
                className={isFetching ? "animate-spin" : undefined}
                aria-hidden
              />
              Retry
            </Button>
          }
          className="border-none bg-transparent px-0 py-8"
        />
      </section>
    );
  }

  const addButton = (
    <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
      <Plus aria-hidden />
      {TIMELINE_PANEL_COPY.addEvent}
    </Button>
  );

  return (
    <>
      <TimelinePanel
        className={className}
        events={events}
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        action={addButton}
        emptyAction={addButton}
        renderActions={(event) => (
          <TimelineEventActionsMenu
            label={`Event actions: ${stageLabel(event.type, event.interviewType)}, ${formatEventDate(event.eventDate) ?? event.eventDate}`}
            onEdit={() => openEdit(event)}
            onDelete={() => setDeleteTarget(event)}
          />
        )}
      />

      {readOnly ? null : (
        <TimelineEventForm
          applicationId={applicationId}
          open={formOpen}
          onOpenChange={setFormOpen}
          event={editingEvent}
          otherEvents={events.filter((e) => e.id !== editingEvent?.id)}
        />
      )}

      <ConfirmDialog
        trigger={<span className="hidden" aria-hidden />}
        title="Delete this event?"
        description="This permanently removes the timeline event. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={deleteEvent.isPending}
        open={deleteTarget != null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      />
    </>
  );
}
