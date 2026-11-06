"use client";

import { useId, useRef, type ReactNode } from "react";
import {
  CircleAlert,
  LoaderCircle,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatSessionTime } from "@/components/profile/devices-copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DeviceRequestInfo } from "./device-sign-in-copy";
import { useFocusIfLost } from "./use-focus-if-lost";

export interface DeviceRequestCardProps {
  request: DeviceRequestInfo;
  /** The code that was verified, shown so the user can match it to the terminal. */
  userCode: string;
  onApprove: () => void;
  onDeny: () => void;
  pending?: "approve" | "deny" | null;
  /** The approve/deny 404/409 `detail`, verbatim. */
  error?: string | null;
  onUseDifferentCode?: () => void;
  className?: string;
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-4">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-sm break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

function Time({ iso }: { iso: string }) {
  // Subscribes: `formatSessionTime` reads the active language at call time.
  useLocale();
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatSessionTime(iso)}
    </time>
  );
}

export function DeviceRequestCard({
  request,
  userCode,
  onApprove,
  onDeny,
  pending = null,
  error = null,
  onUseDifferentCode,
  className,
}: DeviceRequestCardProps) {
  const t = useTranslations("device");
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = pending !== null;
  useFocusIfLost(headingRef);

  const spinner = (
    <LoaderCircle
      aria-hidden
      data-icon="inline-start"
      className="motion-safe:animate-spin"
    />
  );

  return (
    <section
      aria-labelledby={headingId}
      data-slot="device-request"
      className={cn(
        "overflow-hidden rounded-xl bg-card shadow-card",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <SquareTerminal className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-base font-semibold text-foreground outline-none"
          >
            {t("requestTitle")}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {t("requestLead")}
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        <Detail term={t("terms.code")}>
          <span
            data-slot="device-request-code"
            className="font-mono text-lg font-semibold tracking-widest text-foreground"
          >
            {userCode}
          </span>
        </Detail>
        <Detail term={t("terms.device")}>
          <span data-slot="device-request-name" className="font-medium">
            {request.device_name}
          </span>
        </Detail>
        <Detail term={t("terms.client")}>{request.client_label}</Detail>
        <Detail term={t("terms.ip")}>
          {request.ip ? (
            <span className="font-numeric break-all">{request.ip}</span>
          ) : (
            <span className="text-muted-foreground">{t("notRecorded")}</span>
          )}
        </Detail>
        <Detail term={t("terms.requested")}>
          <Time iso={request.requested_at} />
        </Detail>
        <Detail term={t("terms.expires")}>
          <Time iso={request.expires_at} />
        </Detail>
      </dl>

      <div className="flex flex-col gap-4 border-t border-border px-5 py-5 sm:px-6">
        <div
          data-slot="device-request-warning"
          className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-medium text-foreground">{t("warning")}</p>
            <p className="text-foreground/80">{t("warningDetail")}</p>
          </div>
        </div>

        <div role="alert" data-slot="device-request-error">
          {error ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
              <CircleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <span className="min-w-0">{error}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onUseDifferentCode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!busy) onUseDifferentCode();
              }}
              aria-disabled={busy || undefined}
              className="aria-disabled:opacity-60 sm:mr-auto"
            >
              {t("differentCode")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!busy) onDeny();
            }}
            aria-disabled={busy || undefined}
            aria-busy={pending === "deny" || undefined}
            className="w-full aria-disabled:opacity-60 sm:ml-auto sm:w-auto"
          >
            {pending === "deny" ? spinner : null}
            {t("deny")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!busy) onApprove();
            }}
            aria-disabled={busy || undefined}
            aria-busy={pending === "approve" || undefined}
            className="w-full aria-disabled:opacity-60 sm:w-auto"
          >
            {pending === "approve" ? spinner : null}
            {t("approve")}
          </Button>
        </div>
      </div>
    </section>
  );
}
