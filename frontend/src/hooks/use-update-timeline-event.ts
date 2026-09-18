import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TIMELINE_QUERY_KEY } from "@/hooks/use-timeline";
import { services } from "@/services/services";
import type {
  TimelineEvent,
  UpdateTimelineEventPayload,
} from "@/services/types/timeline";

interface UpdateTimelineEventArgs {
  applicationId: string;
  eventId: string;
  payload: UpdateTimelineEventPayload;
}

/**
 * Replaces a timeline event in full via `services.timeline.update` (PUT). On
 * success it invalidates that application's event list so the panel reflects the
 * save. A 404 (not owned) or 409 (archived/closed) propagates for a toast.
 */
export function useUpdateTimelineEvent() {
  const queryClient = useQueryClient();

  return useMutation<TimelineEvent, unknown, UpdateTimelineEventArgs>({
    mutationFn: ({ applicationId, eventId, payload }) =>
      services.timeline.update(applicationId, eventId, payload),
    onSuccess: (_updated, { applicationId }) => {
      void queryClient.invalidateQueries({
        queryKey: TIMELINE_QUERY_KEY.list(applicationId),
      });
    },
  });
}
