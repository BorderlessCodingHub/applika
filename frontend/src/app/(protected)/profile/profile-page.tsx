"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useAuth } from "@/contexts/auth-context";
import { UserProfileView } from "@/components/profile/profile-view";
import { UserProfileEditForm } from "@/components/profile/edit-form";
import { useGeneralStats } from "@/hooks/use-statistics";
import { UserProfileSkeleton } from "@/components/profile/sub-components";
import { GithubRestoreNotice } from "@/components/profile/github-restore-notice";
import { useGithubRestoreReturn } from "@/hooks/use-github-restore";
import { useIsPhone } from "@/hooks/use-is-phone";
import {
  PROFILE_SECTION_HREF,
  ProfileScreen,
  type ProfileSection,
} from "@/components/phone/screens/profile-screen";
import { DevicesScreen } from "@/components/phone/screens/devices-screen";
import { McpScreen } from "@/components/phone/screens/mcp-screen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DevicesTab } from "@/components/profile/devices-tab";
import { McpTab } from "@/components/profile/mcp-tab";
import { APP_CONFIG } from "@/config";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import {
  mcpCreateErrorMessage,
  useCreateMcpToken,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/hooks/use-sessions";

/** The tabs in order: Profile | MCP | Devices (the owner: MCP "just between profile and devices"). */
export const PROFILE_TABS = ["profile", "mcp", "devices"] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

function isProfileTab(value: string | null): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab === value);
}

/**
 * The Devices tab's data half. Mounted only while its tab is open
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

/**
 * The MCP tab's data half (ADR-0028). Mounted only while its tab is open, like
 * Devices. The token of a new connection lives in the create mutation's
 * state while the dialog shows it, and closing the dialog resets it: it is
 * never cached, stored, logged or fetched again.
 */
export function ProfileMcp() {
  const sessions = useSessions();
  const create = useCreateMcpToken();
  const revoke = useRevokeSession();
  const now = useMinuteClock();
  // As Devices: keep "Try again" on screen, aria-busy, until the refetch settles.
  const [retrying, setRetrying] = useState(false);

  return (
    <McpTab
      sessions={sessions.data}
      isLoading={sessions.isPending}
      isError={sessions.isError || retrying}
      onRetry={() => {
        setRetrying(true);
        void sessions.refetch().finally(() => setRetrying(false));
      }}
      isRetrying={retrying}
      endpoint={APP_CONFIG.mcp.endpoint}
      now={now}
      onCreate={(name, scope) => create.mutate({ name, scope })}
      isCreating={create.isPending}
      createError={create.error ? mcpCreateErrorMessage(create.error) : null}
      created={create.data ?? null}
      onCloseResult={create.reset}
      onRevoke={(session) => revoke.mutate(session)}
      revokingId={revoke.isPending ? (revoke.variables?.id ?? null) : null}
    />
  );
}

/**
 * `/profile`: below md the Profile, MCP and Devices boards, one screen with a
 * Profile / MCP / Devices switch (PRD 0021, PRD 0023); at md and up three
 * tabs in the same order.
 */
export function ProfilePage() {
  const isPhone = useIsPhone();
  return isPhone ? <ProfilePhonePage /> : <ProfileDesktopPage />;
}

/**
 * Below md `?tab=` is read on every render (the Account hub's "MCP" and
 * "Devices" and `/mcp`'s "Create a token" open their section): a plain tap
 * on the switch `pushState`s it,
 * so Back returns to the other section. Never `router.push` on the same path
 * (a no-op in this static export).
 */
function ProfilePhonePage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const section: ProfileSection = isProfileTab(requested)
    ? requested
    : "profile";
  const [notice, setNotice] = useGithubRestoreReturn();
  const [editing, setEditing] = useState(false);
  // After a tap on the switch, the other section's nav takes the focus.
  const [switched, setSwitched] = useState(false);
  const select = (next: ProfileSection) => {
    setSwitched(true);
    window.history.pushState(null, "", PROFILE_SECTION_HREF[next]);
  };

  if (section === "mcp") {
    return <McpScreen onSelectSection={select} focusSections={switched} />;
  }

  return section === "devices" ? (
    <DevicesScreen onSelectSection={select} focusSections={switched} />
  ) : (
    <ProfileScreen
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      editing={editing}
      onEditingChange={(next) => {
        // Edit and Cancel remount the nav: only a section switch moves focus to it.
        setSwitched(false);
        setEditing(next);
      }}
      onSelectSection={select}
      focusSections={switched}
    />
  );
}

function ProfileDesktopPage() {
  const [editing, setEditing] = useState(false);
  const t = useTranslations("profile.tabs");

  const { user } = useAuth();
  const stats = useGeneralStats();
  const searchParams = useSearchParams();

  const [notice, setNotice] = useGithubRestoreReturn();
  // `?tab=mcp` (`/mcp`'s "Create a token") and `?tab=devices` open their tab
  // once; switching tabs afterwards is local state only.
  const [tab, setTab] = useState<ProfileTab>(() => {
    const requested = searchParams.get("tab");
    return isProfileTab(requested) ? requested : "profile";
  });

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
        {PROFILE_TABS.map((value) => (
          <TabsTrigger key={value} value={value}>
            {t(value)}
          </TabsTrigger>
        ))}
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
      <TabsContent value="mcp">
        <ProfileMcp />
      </TabsContent>
      <TabsContent value="devices">
        <ProfileDevices />
      </TabsContent>
    </Tabs>
  );
}
