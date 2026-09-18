import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TIMELINE_QUERY_KEY } from "@/hooks/use-timeline";
import { services } from "@/services/services";
import type {
  CreateTimelineEventPayload,
  TimelineEvent,
} from "@/services/types/timeline";

interface CreateTimelineEventArgs {
  applicationId: string;
  payload: CreateTimelineEventPayload;
}

/**
 * Creates a timeline event via `services.timeline.create`. On success it
 * invalidates that application's event list so the panel re-reads with the new
 * entry, the user's agenda (a scheduled event must show up there — AC6/R-026,
 * mirroring the deleted `use-application-steps.ts`'s own
 * `["user","agenda"]` invalidation) and the dashboard statistics (an offer or
 * denied event moves the stage counts — AC4/AC5). A 404 (not owned) or 409
 * (archived/closed) propagates for a toast — the caller decides how to
 * present it.
 */
export function useCreateTimelineEvent() {
  const queryClient = useQueryClient();

  return useMutation<TimelineEvent, unknown, CreateTimelineEventArgs>({
    mutationFn: ({ applicationId, payload }) =>
      services.timeline.create(applicationId, payload),
    onSuccess: (_created, { applicationId }) => {
      void queryClient.invalidateQueries({
        queryKey: TIMELINE_QUERY_KEY.list(applicationId),
      });
      void queryClient.invalidateQueries({ queryKey: ["user", "agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}
