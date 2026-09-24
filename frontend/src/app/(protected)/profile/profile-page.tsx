"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/auth-context";
import { UserProfileView } from "@/components/profile/profile-view";
import { UserProfileEditForm } from "@/components/profile/edit-form";
import { useGeneralStats } from "@/hooks/use-statistics";
import { UserProfileSkeleton } from "@/components/profile/sub-components";
import {
  DiscordLinkNotice,
  isDiscordLinkStatus,
  type DiscordLinkStatus,
} from "@/components/profile/discord-link-notice";
import { USER_QUERY_KEY } from "@/hooks/use-user";

export function ProfilePage() {
  const [editing, setEditing] = useState(false);

  const { user } = useAuth();
  const stats = useGeneralStats();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Copy the status into state from a LAZY initializer — read once, on the
  // page's first render, straight off the incoming URL — rather than from an
  // effect (`react-hooks/set-state-in-effect`). That is what makes the notice
  // survive the URL cleanup below: by the time that runs and clears the query
  // string, `notice` already holds its own copy.
  const [notice, setNotice] = useState<DiscordLinkStatus | null>(() => {
    const account = searchParams.get("account");
    const status = searchParams.get("status");
    return account === "discord" && isDiscordLinkStatus(status) ? status : null;
  });
  // Guards against React Strict Mode's deliberate double-invoke of effects:
  // the invalidate/clear-URL side effects below must run exactly once per
  // redirect, never twice.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const account = searchParams.get("account");
    const status = searchParams.get("status");
    if (account !== "discord" || !isDiscordLinkStatus(status)) return;

    consumed.current = true;
    void queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
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

  if (!user) return <UserProfileSkeleton />;

  if (editing)
    return (
      <UserProfileEditForm
        user={user}
        onSave={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );

  return (
    <>
      {notice ? (
        <DiscordLinkNotice
          status={notice}
          onDismiss={() => setNotice(null)}
          className="mx-auto mb-6 max-w-4xl"
        />
      ) : null}
      <UserProfileView
        user={user}
        userStats={stats.data}
        onEditClick={() => setEditing(true)}
      />
    </>
  );
}
