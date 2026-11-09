"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Smartphone, SquareTerminal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { PhoneConfirmSheet } from "@/components/phone/phone-confirm-sheet";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { fromQuery } from "@/components/phone/phone-query-load";
import {
  ProfileSectionsNav,
  type ProfileSection,
} from "@/components/phone/screens/profile-screen";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/services/types/sessions";

export interface DevicesScreenViewProps {
  /** `useSessions()`, server order kept. */
  sessions: PhoneLoad<readonly UserSession[]>;
  /** After the sheet's confirm; `session.current` is Sign out, else Revoke. */
  onRevoke: (session: UserSession) => void;
  /** The id whose DELETE is in flight (the current row stays pending until the page leaves). */
  revokingId: string | null;
  onRevokeOthers: () => void;
  revokingOthers: boolean;
  /** "Last used" is relative to it (`useMinuteClock()`). */
  now: Date;
  /** See `ProfileSectionsNavProps`. */
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

type Confirm = { kind: "session"; session: UserSession } | { kind: "others" };

/** v2/Devices below md: props in, the board out. */
export function DevicesScreenView({
  sessions,
  onRevoke,
  revokingId,
  onRevokeOthers,
  revokingOthers,
  now,
  onSelectSection,
  focusSections,
}: DevicesScreenViewProps) {
  const t = useTranslations("devices");
  const activeId = useId();
  const endedId = useId();
  const activeHeading = useRef<HTMLHeadingElement>(null);
  // The sheet's subject outlives `open`, so the closing sheet keeps its words.
  const [confirm, setConfirm] = useState<Confirm>({ kind: "others" });
  const [open, setOpen] = useState(false);
  const ask = (subject: Confirm) => {
    setConfirm(subject);
    setOpen(true);
  };
  // The row a confirmed revoke is about to move to Ended (or "others").
  const handOff = useRef<string | null>(null);

  const list = sessions.status === "ready" ? sessions.data : null;
  const active = list?.filter((session) => session.status === "active") ?? [];
  const ended = list?.filter((session) => session.status !== "active") ?? [];
  const others = active.filter((session) => !session.current).length;

  // A revoked card leaves the list after the sheet handed focus back to it:
  // focus would drop to <body>, so it lands on the Active heading.
  useEffect(() => {
    const armed = handOff.current;
    if (armed === null || list === null) return;
    const gone =
      armed === "others"
        ? !list.some((s) => s.status === "active" && !s.current)
        : !list.some((s) => s.id === armed && s.status === "active");
    if (!gone) return;
    handOff.current = null;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    activeHeading.current?.focus({ preventScroll: true });
  }, [list]);

  const sheet =
    confirm.kind === "session"
      ? confirm.session.current
        ? {
            title: t("signOutTitle"),
            description: t("signOutBody"),
            confirmLabel: t("signOut"),
            tone: "primary" as const,
            action: "confirm-sign-out",
          }
        : {
            title: t("revokeTitle", { name: confirm.session.device_name }),
            description: t("revokeBody"),
            confirmLabel: t("revokeConfirm"),
            tone: "danger" as const,
            action: "confirm-revoke",
          }
      : {
          title: t("signOutOthersTitle", { count: others }),
          description: t("signOutOthersBody"),
          confirmLabel: t("signOutOthersConfirm"),
          tone: "danger" as const,
          action: "confirm-sign-out-others",
        };

  return (
    <div data-slot="phone-devices" className="ph-app ph-pf">
      <ProfileSectionsNav
        current="devices"
        onSelect={onSelectSection}
        focusOnMount={focusSections}
      />

      <section aria-labelledby={activeId} className="ph-dv-section">
        <div>
          {/* The board's h1 here is "Active" (v2/Devices). */}
          <h1
            ref={activeHeading}
            id={activeId}
            tabIndex={-1}
            className="ph-h2 ph-focus-target"
          >
            {t("activeTitle")}
          </h1>
          <p className="ph-hint ph-dv-lead">{t("activeDescription")}</p>
        </div>
        <PhoneLoadable
          state={sessions}
          className="ph-dv-section"
          loading={
            <PhoneSkeleton label={t("loading")}>
              <PhoneSkeletonCard className="h-[206px]" />
              <PhoneSkeletonCard className="h-[206px]" />
            </PhoneSkeleton>
          }
        >
          {() =>
            active.length === 0 ? (
              <div data-slot="devices-empty" className="ph-card ph-dv-card">
                <p className="ph-dv-name">{t("emptyTitle")}</p>
                <p className="ph-hint">{t("emptyBody")}</p>
              </div>
            ) : (
              <>
                <ul data-slot="active-devices" className="ph-dv-list">
                  {active.map((session) => (
                    <DeviceCard
                      key={session.id}
                      session={session}
                      now={now}
                      pending={revokingId === session.id}
                      onAsk={() => ask({ kind: "session", session })}
                    />
                  ))}
                </ul>
                {others > 0 ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-disabled={revokingOthers || undefined}
                    aria-busy={revokingOthers || undefined}
                    data-disabled={revokingOthers || undefined}
                    data-slot="sign-out-others"
                    className="ph-btn ph-sec"
                    onClick={() => {
                      if (!revokingOthers) ask({ kind: "others" });
                    }}
                  >
                    {revokingOthers ? (
                      <Loader2
                        size={16}
                        aria-hidden="true"
                        className="ph-spin"
                      />
                    ) : null}
                    {t("signOutOthers")}
                  </button>
                ) : (
                  <p
                    data-slot="no-other-devices"
                    className="ph-hint ph-dv-none"
                  >
                    {t("noOtherDevices")}
                  </p>
                )}
              </>
            )
          }
        </PhoneLoadable>
      </section>

      {list !== null ? (
        <section aria-labelledby={endedId} className="ph-dv-section">
          <h2 id={endedId} className="ph-h2">
            {t("endedTitle")}
          </h2>
          {ended.length > 0 ? (
            <ul data-slot="ended-devices" className="ph-group">
              {ended.map((session) => (
                <li
                  key={session.id}
                  data-slot="device-row"
                  data-session-id={session.id}
                  data-status={session.status}
                  className="ph-row ph-dv-ended"
                >
                  <span className="ph-grow">
                    <span className="ph-dv-ended-name">
                      {session.device_name}
                    </span>
                    <span className="ph-dv-sub">
                      {t(`method.${session.sign_in_method}`)}
                    </span>
                  </span>
                  <PhonePill>{t(`status.${session.status}`)}</PhonePill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ph-hint">{t("endedEmpty")}</p>
          )}
        </section>
      ) : null}

      <PhoneConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={sheet.title}
        description={sheet.description}
        cancelLabel={t("cancel")}
        confirmLabel={sheet.confirmLabel}
        tone={sheet.tone}
        confirmAction={sheet.action}
        fallbackFocus={activeHeading}
        onConfirm={() => {
          setOpen(false);
          if (confirm.kind === "others") {
            handOff.current = "others";
            onRevokeOthers();
          } else {
            handOff.current = confirm.session.id;
            onRevoke(confirm.session);
          }
        }}
      />
    </div>
  );
}

function DeviceCard({
  session,
  now,
  pending,
  onAsk,
}: {
  session: UserSession;
  now: Date;
  pending: boolean;
  onAsk: () => void;
}) {
  const t = useTranslations("devices");
  const tPhone = useTranslations("phone.devices");
  const format = useFormatter();
  const nameId = useId();
  const current = session.current;
  const Icon = session.client_type === "cli" ? SquareTerminal : Smartphone;
  const expires = new Date(session.expires_at);

  return (
    <li
      data-slot="device-row"
      data-session-id={session.id}
      data-status={session.status}
      data-current={current || undefined}
      className="ph-card ph-dv-card"
    >
      <div className="ph-dv-head">
        <span aria-hidden="true" className="ph-dv-ic">
          <Icon size={18} />
        </span>
        <div className="ph-dv-who">
          <div className="ph-dv-title">
            <span id={nameId} className="ph-dv-name">
              {session.device_name}
            </span>
            {current ? (
              <PhonePill tone="pri" className="ph-dv-here">
                {t("thisDevice")}
              </PhonePill>
            ) : null}
          </div>
          <div className="ph-dv-method">
            {t(`method.${session.sign_in_method}`)}
          </div>
        </div>
      </div>
      <dl className="ph-dv-dl">
        <dt>{t("terms.ip")}</dt>
        <dd
          data-slot="device-last-ip"
          className={cn(session.last_ip && "ph-mono")}
        >
          {session.last_ip ?? t("notRecorded")}
        </dd>
        <dt>{t("terms.lastUsed")}</dt>
        <dd>
          {session.last_used_at ? (
            <time
              dateTime={session.last_used_at}
              title={format.dateTime(new Date(session.last_used_at), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            >
              {format.relativeTime(new Date(session.last_used_at), now)}
            </time>
          ) : (
            t("never")
          )}
        </dd>
        <dt>{t("terms.expires")}</dt>
        <dd>
          <time dateTime={session.expires_at}>
            {format.dateTime(expires, {
              month: "short",
              day: "numeric",
              ...(expires.getFullYear() === now.getFullYear()
                ? {}
                : { year: "numeric" as const }),
            })}
          </time>
        </dd>
      </dl>
      <button
        type="button"
        data-slot="device-action"
        aria-haspopup="dialog"
        aria-label={
          current
            ? undefined
            : tPhone("revokeLabel", { name: session.device_name })
        }
        aria-describedby={current ? nameId : undefined}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-disabled={pending || undefined}
        className={cn("ph-btn ph-sm", current ? "ph-sec" : "ph-dan")}
        onClick={() => {
          if (!pending) onAsk();
        }}
      >
        {pending ? (
          <Loader2 size={16} aria-hidden="true" className="ph-spin" />
        ) : null}
        {current ? t("signOut") : t("revoke")}
      </button>
    </li>
  );
}

export interface DevicesScreenProps {
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

/**
 * v2/Devices with its data (`/profile?tab=devices` below md): today's
 * sessions and revoke calls. Signing this device out leaves for `/login`
 * (`useRevokeSession`); the list is fetched once this section shows.
 */
export function DevicesScreen({
  onSelectSection,
  focusSections,
}: DevicesScreenProps) {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const now = useMinuteClock();

  return (
    <DevicesScreenView
      sessions={fromQuery(sessions)}
      onRevoke={(session) => revoke.mutate(session)}
      // A signed-out current row stays pending until the page has left.
      revokingId={
        revoke.isPending || (revoke.isSuccess && revoke.variables?.current)
          ? (revoke.variables?.id ?? null)
          : null
      }
      onRevokeOthers={() => revokeOthers.mutate()}
      revokingOthers={revokeOthers.isPending}
      now={now}
      onSelectSection={onSelectSection}
      focusSections={focusSections}
    />
  );
}
