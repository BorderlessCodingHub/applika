import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { word } from "@/i18n/translator";
import {
  isGithubRestoreStatus,
  type GithubRestoreStatus,
} from "@/components/profile/github-restore-copy";
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
        toast.error(word("profile.githubRestore.unavailable"));
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

/**
 * GitHub's callback lands on `/profile?account=github&status=…`: the status
 * to show (`GithubRestoreNotice`) and its setter, for both widths of the
 * profile. Read once, from a LAZY initializer straight off the incoming URL,
 * rather than from an effect (`react-hooks/set-state-in-effect`): that is
 * what makes the notice survive the URL cleanup below.
 */
export function useGithubRestoreReturn() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<GithubRestoreStatus | null>(() => {
    const account = searchParams.get("account");
    const status = searchParams.get("status");
    return account === "github" && isGithubRestoreStatus(status)
      ? status
      : null;
  });
  // Guards against React Strict Mode's deliberate double-invoke of effects:
  // the invalidate/clear-URL side effects below must run exactly once per
  // redirect, never twice.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const account = searchParams.get("account");
    const status = searchParams.get("status");
    if (account !== "github" || !isGithubRestoreStatus(status)) return;

    consumed.current = true;
    // `restored` signed this browser in as the old account: refetch who we
    // are (and everything cached for the deleted new account).
    if (status === "restored") {
      void queryClient.invalidateQueries();
    } else {
      void queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    }
    // Next's app-router `useRouter().replace()` is a no-op here: this app is
    // a fully static export (`output: "export"`, no server to resolve a
    // route transition against) and clearing ONLY the query string on the
    // SAME path never triggers a navigation in this build (verified against
    // the real e2e stack — `router.replace("/profile")` left the URL bar
    // showing the original `?account=&status=` query indefinitely). The
    // History API is what the browser actually uses to update the address
    // bar, so we drive it directly rather than through a router that isn't
    // doing anything on this specific transition.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/profile");
    }
  }, [searchParams, queryClient]);

  return [notice, setNotice] as const;
}
