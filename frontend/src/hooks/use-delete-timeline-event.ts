import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TIMELINE_QUERY_KEY } from "@/hooks/use-timeline";
import { services } from "@/services/services";

interface DeleteTimelineEventArgs {
  applicationId: string;
  eventId: string;
}

/**
 * Deletes a timeline event via `services.timeline.remove`. On success it
 * invalidates that application's event list so the panel re-reads without the
 * removed entry. A 404 (not owned) or 409 (archived/closed) propagates for a
 * toast.
 */
export function useDeleteTimelineEvent() {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, DeleteTimelineEventArgs>({
    mutationFn: ({ applicationId, eventId }) =>
      services.timeline.remove(applicationId, eventId),
    onSuccess: (_result, { applicationId }) => {
      void queryClient.invalidateQueries({
        queryKey: TIMELINE_QUERY_KEY.list(applicationId),
      });
    },
  });
}
