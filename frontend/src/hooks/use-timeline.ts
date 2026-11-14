import { useQuery } from "@tanstack/react-query";

import { services } from "@/services/services";

/**
 * Query-key factory for the application timeline (PRD 0008, ADR 0012). Every
 * entry is scoped by application id so one application's events never collide
 * with another's. The `["timeline"]` root lets a mutation invalidate every
 * scope at once if needed; `list(applicationId)` keys a single application's
 * stream.
 */
export const TIMELINE_QUERY_KEY = {
  all: ["timeline"] as const,
  list: (applicationId: string) => ["timeline", "list", applicationId] as const,
};

/**
 * Lists one application's timeline events via
 * `services.timeline.list(applicationId)`. Disabled until an id is present.
 * The global query client already retries `false` (`src/lib/query-client.ts`),
 * so a genuine "not authenticated" settles fast and the auth interceptor's
 * cookie refresh handles the rest.
 */
export function useTimeline(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: TIMELINE_QUERY_KEY.list(applicationId ?? ""),
    queryFn: () => services.timeline.list(applicationId as string),
    enabled: Boolean(applicationId),
  });
}
