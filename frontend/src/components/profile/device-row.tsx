"use client";

import { useId, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { Globe, LoaderCircle, LogOut, SquareTerminal } from "lucide-react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionStatus, UserSession } from "@/services/types/sessions";

import {
  DEVICE_TERMS,
  DEVICES_COPY,
  SESSION_STATUS_LABEL,
  SIGN_IN_METHOD_LABEL,
  formatSessionTime,
  revokeTitle,
  sessionEndedAt,
  signInIpLine,
} from "./devices-copy";

export interface DeviceRowProps {
  session: UserSession;
  /** Active rows only; the current row's confirm says "Sign out". */
  onRevoke?: (session: UserSession) => void;
  pending?: boolean;
  className?: string;
}

const STATUS_DOT: Record<SessionStatus, string> = {
  active: "bg-success",
  signed_out: "bg-muted-foreground",
  revoked: "bg-destructive",
  expired: "bg-warning",
};

export function DeviceStatusBadge({ status }: { status: SessionStatus }) {
  useLocale();
  return (
    <Badge
      variant="outline"
      data-slot="device-status"
      data-status={status}
      className={cn(
        "gap-1.5 text-foreground",
        status === "active" && "border-success/30 bg-success/10",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_DOT[status])}
      />
      {SESSION_STATUS_LABEL[status]}
    </Badge>
  );
}

function Detail({
  term,
  children,
  className,
}: {
  term: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 @xl/device-row:flex @xl/device-row:flex-col @xl/device-row:gap-0.5",
        className,
      )}
    >
      <dt className="text-muted-foreground @xl/device-row:text-xs">{term}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatSessionTime(iso)}
    </time>
  );
}

export function DeviceRow({
  session,
  onRevoke,
  pending = false,
  className,
}: DeviceRowProps) {
  // Subscribes: the copy getters and `formatSessionTime` read the active
  // language at call time, so a switch re-renders the words and the dates.
  useLocale();
  const nameId = useId();
  const active = session.status === "active";
  const current = active && session.current;
  const Icon = session.client_type === "cli" ? SquareTerminal : Globe;
  const terms = DEVICE_TERMS;

  return (
    <li
      data-slot="device-row"
      data-session-id={session.id}
      data-status={session.status}
      data-current={current || undefined}
      className={cn(
        "@container/device-row relative flex flex-col gap-4 px-4 py-5 sm:px-6",
        current &&
          "bg-primary/4 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            current
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4.5" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <h3
            id={nameId}
            className="min-w-0 text-sm leading-snug font-semibold break-words text-foreground"
          >
            {session.device_name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {current ? (
              <Badge
                variant="outline"
                data-slot="this-device"
                className="border-primary/30 bg-primary-muted text-foreground"
              >
                {DEVICES_COPY.thisDevice}
              </Badge>
            ) : null}
            <DeviceStatusBadge status={session.status} />
          </div>
        </div>

        {active && onRevoke ? (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-slot="device-action"
                aria-describedby={nameId}
                aria-disabled={pending || undefined}
                aria-busy={pending || undefined}
                onClick={(event) => {
                  if (pending) event.preventDefault();
                }}
                className="shrink-0 hover:border-destructive/40 aria-disabled:opacity-60"
              >
                {pending ? (
                  <LoaderCircle
                    aria-hidden
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                  />
                ) : current ? (
                  <LogOut aria-hidden data-icon="inline-start" />
                ) : null}
                {current ? DEVICES_COPY.signOut : DEVICES_COPY.revoke}
              </Button>
            }
            title={
              current
                ? DEVICES_COPY.signOutTitle
                : revokeTitle(session.device_name)
            }
            description={
              current ? DEVICES_COPY.signOutBody : DEVICES_COPY.revokeBody
            }
            confirmLabel={
              current ? DEVICES_COPY.signOut : DEVICES_COPY.revokeConfirm
            }
            cancelLabel={DEVICES_COPY.cancel}
            destructive={!current}
            onConfirm={() => onRevoke(session)}
          />
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-y-2 text-sm @xl/device-row:grid-cols-3 @xl/device-row:gap-x-6 @xl/device-row:gap-y-3 @xl/device-row:pl-12">
        <Detail term={terms.client}>{session.client_label}</Detail>
        <Detail term={terms.method}>
          {SIGN_IN_METHOD_LABEL[session.sign_in_method]}
        </Detail>
        <Detail term={terms.ip}>
          {session.last_ip ? (
            <span
              data-slot="device-last-ip"
              className="font-numeric wrap-anywhere"
            >
              {session.last_ip}
            </span>
          ) : (
            <span data-slot="device-last-ip" className="text-muted-foreground">
              {DEVICES_COPY.notRecorded}
            </span>
          )}
          <span
            data-slot="device-sign-in-ip"
            className="block text-xs wrap-anywhere text-muted-foreground"
          >
            {signInIpLine(session.created_ip)}
          </span>
        </Detail>
        <Detail term={terms.granted}>
          <Time iso={session.created_at} />
        </Detail>
        <Detail term={terms.lastUsed}>
          {session.last_used_at ? (
            <Time iso={session.last_used_at} />
          ) : (
            <span className="text-muted-foreground">{DEVICES_COPY.never}</span>
          )}
        </Detail>
        <Detail term={active ? terms.expires : terms.ended}>
          <Time iso={active ? session.expires_at : sessionEndedAt(session)} />
        </Detail>
      </dl>
    </li>
  );
}
