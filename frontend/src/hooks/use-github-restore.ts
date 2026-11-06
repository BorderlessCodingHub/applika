import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";

import { USER_QUERY_KEY } from "@/hooks/use-user";
import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type { GithubRestoreStart } from "@/services/types/auth";
import type { User } from "@/services/types/users";

/**
 * Starts the one-shot GitHub data restore (`POST /auth/github/restore`). On
 * success the browser leaves for GitHub's consent page with a top-level
 * navigation (never an in-app push: OAuth owns the tab), and GitHub's
 * callback lands on `/profile?account=github&status=…`. The server marks the
 * `/welcome` prompt seen when it answers. 409 (this account already has its
 * GitHub data) and 503 (restore not configured) are toasts.
 */
export function useStartGithubRestore() {
  return useMutation({
    mutationFn: () => services.auth.startGithubRestore(),
    onSuccess: (data: GithubRestoreStart) => {
      window.location.assign(data.authorize_url);
    },
    onError: (err: AxiosError) => {
      if (err.response?.status === 503) {
        toast.error("Restoring from GitHub is unavailable right now");
        return;
      }
      toast.error(getApiError(err));
    },
  });
}

/**
 * Answers the `/welcome` choice with "Start fresh"
 * (`POST /users/me/github-restore/dismiss`, idempotent). The cached user
 * drops its prompt at once, so the protected layout stops sending the
 * browser back to `/welcome`, then the user is refetched.
 */
export function useDismissGithubRestore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.auth.dismissGithubRestore(),
    onSuccess: () => {
      queryClient.setQueryData<User>(USER_QUERY_KEY, (user) =>
        user
          ? {
              ...user,
              github_restore: { ...user.github_restore, prompt: false },
            }
          : user,
      );
      void queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}
