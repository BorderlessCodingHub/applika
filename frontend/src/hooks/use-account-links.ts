import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-client";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { services } from "@/services/services";
import { AccountLinkStart } from "@/services/types/auth";

/**
 * Discord account-link hooks (KODI-022, plan 0009 · Frontend).
 *
 * The profile screen only ever has ONE provider today (Discord), so this is
 * not a per-provider dispatch table.
 */

/**
 * Kicks off the Discord OAuth handshake. On success the backend hands back a
 * real `authorize_url`; we perform a top-level navigation to it — never an
 * in-app router push, OAuth must own the tab — so there is no success toast,
 * only a failure one. A 503 means the server has no Discord OAuth app
 * configured; every other error surfaces the server's own `detail`.
 */
export function useStartDiscordLink() {
  return useMutation({
    mutationFn: () => services.auth.startDiscordLink(),
    onSuccess: (data: AccountLinkStart) => {
      window.location.assign(data.authorize_url);
    },
    onError: (err: AxiosError) => {
      if (err.response?.status === 503) {
        toast.error("Discord linking is unavailable");
        return;
      }
      toast.error(getApiError(err));
    },
  });
}

/**
 * Unlinks Discord (`DELETE /auth/link/discord`, idempotent). On success we
 * invalidate the shared `USER_QUERY_KEY` so the connected-accounts card and
 * any other `useUserProfile()` consumer see `discord_linked: false`.
 */
export function useUnlinkDiscord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => services.auth.unlinkDiscord(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
      toast.success("Discord disconnected");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}
