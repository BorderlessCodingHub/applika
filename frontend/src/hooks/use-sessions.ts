import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { rateLimitNotice } from "@/lib/rate-limit";
import { services } from "@/services/services";
import type { UserSession } from "@/services/types/sessions";

/**
 * The profile's Devices tab (KODI-058, ADR-0019): the caller's web and CLI
 * sessions, active then ended within 30 days, in the server's order.
 */
export const SESSIONS_QUERY_KEY = ["sessions"] as const;

/** Where the current device lands once it signed itself out (Plan corrections 6). */
export const SIGNED_OUT_PATH = "/login";

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => services.sessions.list(),
  });
}

function revokeFailed(error: unknown) {
  toast.error(rateLimitNotice(error) ?? "Failed to revoke device");
}

/**
 * Revokes one device after its confirm. The current row is "Sign out": the
 * server ends the session and clears both cookies, so the page leaves for
 * `/login` with a full navigation (not `useAuth().logout`, which goes to `/`).
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: UserSession) => services.sessions.revoke(session.id),
    onSuccess: (_data, session) => {
      if (session.current) {
        window.location.assign(SIGNED_OUT_PATH);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
    onError: (error) => {
      revokeFailed(error);
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
  });
}

/** "Sign out all other devices": every active session but this one. */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => services.sessions.revokeOthers(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
    onError: revokeFailed,
  });
}
