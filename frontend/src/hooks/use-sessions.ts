import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { word } from "@/i18n/translator";
import { apiErrorMessage } from "@/lib/api-error-message";
import { rateLimitNotice } from "@/lib/rate-limit";
import { services } from "@/services/services";
import type { McpTokenCreate, UserSession } from "@/services/types/sessions";

/**
 * The profile's Devices and MCP tabs (ADR-0019, ADR-0028): the caller's web,
 * CLI and MCP sessions, active then ended within 30 days, in the server's
 * order.
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
  toast.error(rateLimitNotice(error) ?? word("devices.revokeFailed"));
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

/**
 * "Create token" in Profile › MCP (ADR-0028). The 201 answer is the only one
 * that ever carries the token: it lives in this mutation's state while the
 * dialog shows it, `reset()` drops it on close, and `gcTime: 0` lets the
 * mutation cache forget it as soon as nothing observes it. Never logged,
 * never in a query cache, never refetched. The list refreshes so the new
 * connection appears in the MCP tab and in Devices.
 */
export function useCreateMcpToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: McpTokenCreate) =>
      services.sessions.createMcpToken(body),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
  });
}

/**
 * A refused "Create token" in words, said once inside the dialog (no toast):
 * a 429 with its wait, else the code's message or the server's `detail`
 * verbatim (ADR-0025), else `mcpCreate.failed`.
 */
export function mcpCreateErrorMessage(error: unknown): string {
  const fallback = word("mcpCreate.failed");
  const notice = rateLimitNotice(error);
  if (notice) return notice;
  if (!isAxiosError(error) || !error.response) return fallback;
  return apiErrorMessage(error.response.data, fallback);
}
