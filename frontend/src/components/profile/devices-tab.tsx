"use client";

import { useEffect, useId, useRef } from "react";
import {
  CircleAlert,
  History,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
} from "lucide-react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/services/types/sessions";

import { DeviceRow } from "./device-row";
import { DEVICES_COPY, signOutOthersTitle } from "./devices-copy";

export type DevicesTabState = "loading" | "error" | "ready";

export interface DevicesTabProps {
  /** Server order, kept as is. */
  sessions: readonly UserSession[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Called after the confirm; `session.current` tells "Sign out" from "Revoke". */
  onRevoke: (session: UserSession) => void;
  /** The id whose DELETE is in flight. */
  revokingId?: string | null;
  onRevokeOthers: () => void;
  isRevokingOthers?: boolean;
  className?: string;
}

export function devicesTabState({
  sessions,
  isLoading,
  isError,
}: Pick<
  DevicesTabProps,
  "sessions" | "isLoading" | "isError"
>): DevicesTabState {
  if (sessions) return "ready";
  if (isError) return "error";
  return isLoading === false ? "ready" : "loading";
}

const SECTION = "overflow-hidden rounded-xl bg-card shadow-card";
const SECTION_HEAD = "border-b border-border px-4 py-4 sm:px-6";
const SECTION_TITLE =
  "text-sm font-semibold text-foreground outline-none focus-visible:underline";

export function DevicesTab({
  sessions,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  onRevoke,
  revokingId = null,
  onRevokeOthers,
  isRevokingOthers = false,
  className,
}: DevicesTabProps) {
  const activeHeadingId = useId();
  const endedHeadingId = useId();
  const othersHintId = useId();
  const activeHeadingRef = useRef<HTMLHeadingElement>(null);
  const handOffId = useRef<string | null>(null);
  const retried = useRef(false);

  const state = devicesTabState({ sessions, isLoading, isError });
  const list = sessions ?? [];
  const active = list.filter((session) => session.status === "active");
  const ended = list.filter((session) => session.status !== "active");
  const otherCount = active.filter((session) => !session.current).length;
  const othersLocked = otherCount === 0 || isRevokingOthers;

  // A revoked row moves to Ended and a successful Retry unmounts its button: either drops focus to <body>.
  useEffect(() => {
    const armed = handOffId.current;
    const revokedGone =
      armed !== null &&
      !(sessions ?? []).some(
        (session) => session.id === armed && session.status === "active",
      );
    const retryDone = retried.current && state === "ready";
    if (!revokedGone && !retryDone) return;
    handOffId.current = null;
    retried.current = false;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    activeHeadingRef.current?.focus({ preventScroll: true });
  }, [sessions, state]);

  const revoke = (session: UserSession) => {
    handOffId.current = session.id;
    onRevoke(session);
  };

  return (
    <div
      data-slot="devices-tab"
      data-state={state}
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", className)}
    >
      <section aria-labelledby={activeHeadingId} className={SECTION}>
        <div
          className={cn(
            SECTION_HEAD,
            "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <MonitorSmartphone
                aria-hidden
                className="size-4 text-muted-foreground"
              />
              <h2
                ref={activeHeadingRef}
                id={activeHeadingId}
                tabIndex={-1}
                className={SECTION_TITLE}
              >
                {DEVICES_COPY.activeTitle}
              </h2>
            </div>
            <p className="text-sm text-pretty text-muted-foreground">
              {DEVICES_COPY.activeDescription}
            </p>
          </div>

          {state === "ready" && active.length > 0 ? (
            <div className="flex flex-col gap-1.5 sm:shrink-0 sm:items-end">
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-slot="sign-out-others"
                    aria-disabled={othersLocked || undefined}
                    aria-busy={isRevokingOthers || undefined}
                    aria-describedby={
                      otherCount === 0 ? othersHintId : undefined
                    }
                    onClick={(event) => {
                      if (othersLocked) event.preventDefault();
                    }}
                    className="h-auto min-h-8 w-full py-1.5 whitespace-normal hover:border-destructive/40 aria-disabled:opacity-60 sm:h-8 sm:w-auto sm:py-0 sm:whitespace-nowrap"
                  >
                    {isRevokingOthers ? (
                      <LoaderCircle
                        aria-hidden
                        data-icon="inline-start"
                        className="motion-safe:animate-spin"
                      />
                    ) : null}
                    {DEVICES_COPY.signOutOthers}
                  </Button>
                }
                title={signOutOthersTitle(otherCount)}
                description={DEVICES_COPY.signOutOthersBody}
                confirmLabel={DEVICES_COPY.signOutOthersConfirm}
                cancelLabel={DEVICES_COPY.cancel}
                onConfirm={onRevokeOthers}
              />
              {otherCount === 0 ? (
                <p id={othersHintId} className="text-xs text-muted-foreground">
                  {DEVICES_COPY.noOtherDevices}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {state === "loading" ? (
          <div role="status" className="flex flex-col divide-y divide-border">
            <span className="sr-only">{DEVICES_COPY.loading}</span>
            {[0, 1].map((row) => (
              <div
                key={row}
                aria-hidden
                className="@container/device-row flex flex-col gap-4 px-4 py-5 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2 pt-0.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="grid grid-cols-1 gap-y-2.5 @xl/device-row:grid-cols-3 @xl/device-row:gap-x-6 @xl/device-row:gap-y-3 @xl/device-row:pl-12">
                  {[0, 1, 2, 3, 4, 5].map((cell) => (
                    <div
                      key={cell}
                      className="flex items-center gap-3 @xl/device-row:flex-col @xl/device-row:items-start @xl/device-row:gap-1.5"
                    >
                      <Skeleton className="h-3 w-30 @xl/device-row:w-16" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <div role="alert" className="p-4">
            <EmptyState
              icon={CircleAlert}
              title={DEVICES_COPY.loadErrorTitle}
              description={DEVICES_COPY.loadErrorBody}
              action={
                onRetry ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-disabled={isRetrying || undefined}
                    aria-busy={isRetrying || undefined}
                    className="aria-disabled:opacity-60"
                    onClick={() => {
                      if (isRetrying) return;
                      retried.current = true;
                      onRetry();
                    }}
                  >
                    {isRetrying ? (
                      <LoaderCircle
                        aria-hidden
                        data-icon="inline-start"
                        className="motion-safe:animate-spin"
                      />
                    ) : (
                      <RefreshCw aria-hidden data-icon="inline-start" />
                    )}
                    {DEVICES_COPY.retry}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : active.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={MonitorSmartphone}
              title={DEVICES_COPY.emptyTitle}
              description={DEVICES_COPY.emptyBody}
            />
          </div>
        ) : (
          <ul data-slot="active-devices" className="divide-y divide-border">
            {active.map((session) => (
              <DeviceRow
                key={session.id}
                session={session}
                onRevoke={revoke}
                pending={revokingId === session.id}
              />
            ))}
          </ul>
        )}
      </section>

      {state === "ready" ? (
        <section aria-labelledby={endedHeadingId} className={SECTION}>
          <div className={cn(SECTION_HEAD, "flex items-center gap-2")}>
            <History aria-hidden className="size-4 text-muted-foreground" />
            <h2 id={endedHeadingId} className={SECTION_TITLE}>
              {DEVICES_COPY.endedTitle}
            </h2>
          </div>
          {ended.length > 0 ? (
            <ul data-slot="ended-devices" className="divide-y divide-border">
              {ended.map((session) => (
                <DeviceRow key={session.id} session={session} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-muted-foreground sm:px-6">
              {DEVICES_COPY.endedEmpty}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
