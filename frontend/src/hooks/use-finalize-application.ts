import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TIMELINE_QUERY_KEY } from "@/hooks/use-timeline";
import { services } from "@/services/services";
import type {
  Application,
  FinalizeApplicationPayload,
} from "@/services/types/applications";

interface FinalizeApplicationArgs {
  applicationId: string;
  /**
   * Omit for a bodyless close (outcome "none" — no outcome event). Present
   * records the offer/denied outcome as the closing timeline event (R-032).
   */
  payload?: FinalizeApplicationPayload;
}

/**
 * Closes (finalizes) an application via `services.applications.finalize`
 * (POST; no body for outcome "none", or the offer/denied outcome body —
 * R-032). On success it invalidates the applications list, the statistics
 * (offer/denied counts move) and — since a chosen outcome lands as a new
 * timeline event — that application's timeline. Finalizing is idempotent, so
 * this never conflicts on an already-closed application; a 409 (already
 * closed — reopen first) or 422 (archived) propagates for a toast at the call
 * site.
 *
 * Adapted from mynextjob's `useFinalizeApplication` (which POSTs with no body
 * and primes a per-application detail cache applika does not have —
 * `useApplicationById` reads the SAME list cache as `useApplications`, so
 * there is nothing to prime here; invalidating `["applications"]` covers it).
 */
export function useFinalizeApplication() {
  const queryClient = useQueryClient();

  return useMutation<Application, unknown, FinalizeApplicationArgs>({
    mutationFn: ({ applicationId, payload }) =>
      services.applications.finalize(applicationId, payload),
    onSuccess: (_updated, { applicationId }) => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "agenda"] });
      void queryClient.invalidateQueries({
        queryKey: TIMELINE_QUERY_KEY.list(applicationId),
      });
    },
  });
}
