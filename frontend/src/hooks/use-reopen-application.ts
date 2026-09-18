import { useMutation, useQueryClient } from "@tanstack/react-query";

import { services } from "@/services/services";
import type { Application } from "@/services/types/applications";

/**
 * Reopens a closed application via `services.applications.reopen` (POST, no
 * body). On success it invalidates the applications list and the statistics
 * so the closed badge, the read-only timeline and the offer/denied counts all
 * reflect the reopened state. Reopening is idempotent — a no-op on an already
 * -open application — so it never conflicts; a 422 (archived) or 404 (not
 * owned) propagates for a toast at the call site.
 */
export function useReopenApplication() {
  const queryClient = useQueryClient();

  return useMutation<Application, unknown, string>({
    mutationFn: (id) => services.applications.reopen(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}
