"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/auth-context";
import { UserProfileView } from "@/components/profile/profile-view";
import { UserProfileEditForm } from "@/components/profile/edit-form";
import { useGeneralStats } from "@/hooks/use-statistics";
import { UserProfileSkeleton } from "@/components/profile/sub-components";
import { GithubRestoreNotice } from "@/components/profile/github-restore-notice";
import {
  isGithubRestoreStatus,
  type GithubRestoreStatus,
} from "@/components/profile/github-restore-copy";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DevicesTab } from "@/components/profile/devices-tab";
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/hooks/use-sessions";

export type ProfileTab = "profile" | "devices";

function isProfileTab(value: string | null): value is ProfileTab {
  return value === "profile" || value === "devices";
}

/**
 * The Devices tab's data half (KODI-058). Mounted only while its tab is open
 * (Radix unmounts an inactive `TabsContent`), so the list is fetched on first
 * open, not with the profile.
 */
export function ProfileDevices() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  // TanStack v5 puts an errored query with no data back to `pending` on
  // refetch, which would swap the error card for the skeleton; holding the
  // retry here keeps "Try again" on screen, aria-busy, until it settles.
  const [retrying, setRetrying] = useState(false);

  return (
    <DevicesTab
      sessions={sessions.data}
      isLoading={sessions.isPending}
      isError={sessions.isError || retrying}
      onRetry={() => {
        setRetrying(true);
        void sessions.refetch().finally(() => setRetrying(false));
      }}
      isRetrying={retrying}
      onRevoke={(session) => revoke.mutate(session)}
      // A signed-out current row stays pending until the page has left.
      revokingId={
        revoke.isPending || (revoke.isSuccess && revoke.variables?.current)
          ? (revoke.variables?.id ?? null)
          : null
      }
      onRevokeOthers={() => revokeOthers.mutate()}
      isRevokingOthers={revokeOthers.isPending}
    />
  );
}

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
  const [notice, setNotice] = useState<GithubRestoreStatus | null>(() => {
    const account = searchParams.get("account");
    const status = searchParams.get("status");
    return account === "github" && isGithubRestoreStatus(status)
      ? status
      : null;
  });
  // `?tab=devices` (the `/device` page's "See your devices" link) opens the
  // Devices tab once; switching tabs afterwards is local state only.
  const [tab, setTab] = useState<ProfileTab>(() => {
    const requested = searchParams.get("tab");
    return isProfileTab(requested) ? requested : "profile";
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

  if (!user) return <UserProfileSkeleton />;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isProfileTab(value)) setTab(value);
      }}
      className="mx-auto w-full max-w-4xl gap-6"
    >
      <TabsList variant="line">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="devices">Devices</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        {editing ? (
          <UserProfileEditForm
            user={user}
            onSave={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {notice ? (
              <GithubRestoreNotice
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
        )}
      </TabsContent>
      <TabsContent value="devices">
        <ProfileDevices />
      </TabsContent>
    </Tabs>
  );
}
