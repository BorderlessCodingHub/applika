"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  LoaderCircle,
  SquareTerminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { DeviceCodeFormProps } from "@/components/device/device-code-form";
import type { DeviceOutcomeProps } from "@/components/device/device-outcome";
import type { DeviceRequestCardProps } from "@/components/device/device-request-card";
import {
  DEVICES_HREF,
  isCompleteUserCode,
  normalizeUserCode,
} from "@/components/device/device-sign-in-copy";
import { useFocusIfLost } from "@/components/device/use-focus-if-lost";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import { formatSessionTime } from "@/components/profile/devices-copy";
import { cn } from "@/lib/utils";

// v2/DeviceSignIn below md; each view takes its desktop twin's props (components/device/*).

const SPINNER = (
  <LoaderCircle
    size={18}
    strokeWidth={2.25}
    aria-hidden="true"
    className="ph-spin"
  />
);

const BUSY = "aria-disabled:cursor-progress aria-disabled:opacity-75";

export function PhoneDeviceCode({
  code,
  onCodeChange,
  onSubmit,
  pending = false,
  error = null,
  autoFocus = false,
  className,
}: DeviceCodeFormProps) {
  const t = useTranslations("device");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [incomplete, setIncomplete] = useState(false);
  const message = incomplete ? t("incomplete") : error;

  return (
    <form
      noValidate
      data-slot="device-code-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (!isCompleteUserCode(code)) {
          setIncomplete(true);
          inputRef.current?.focus();
          return;
        }
        onSubmit(code);
      }}
      className={cn("ph-app ph-below-top flex flex-col", className)}
    >
      <div className="flex flex-1 flex-col px-6 pt-6">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-primary-muted text-primary">
          <SquareTerminal size={26} aria-hidden="true" />
        </span>
        <h1 className="ph-h1 mt-6">{t("title")}</h1>
        <p className="ph-lead">{t("lead")}</p>
        <div className="ph-field mt-7">
          <label htmlFor={inputId} className="ph-lbl">
            {t("codeLabel")}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="user_code"
            value={code}
            onChange={(event) => {
              setIncomplete(false);
              onCodeChange(normalizeUserCode(event.target.value));
            }}
            autoFocus={autoFocus}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            maxLength={9}
            placeholder={t("codePlaceholder")}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${hintId} ${errorId}` : hintId}
            className="ph-input ph-mono ph-device-code"
          />
          <p id={hintId} className="ph-hint">
            {t("codeHint")}
          </p>
          <p
            id={errorId}
            role="alert"
            data-slot="device-code-error"
            className="ph-hint text-(color:--destructive-text)"
          >
            {message}
          </p>
        </div>
      </div>
      <div className="ph-safe-bottom px-6 pt-4">
        <button
          type="submit"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          className={cn("ph-btn ph-pri h-14 w-full", BUSY)}
        >
          {pending ? SPINNER : null}
          {t("continue")}
        </button>
      </div>
    </form>
  );
}

function Time({ iso }: { iso: string }) {
  // Subscribes: `formatSessionTime` reads the active language at call time.
  useLocale();
  return <time dateTime={iso}>{formatSessionTime(iso)}</time>;
}

export function PhoneDeviceRequest({
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

  return (
    <section
      aria-labelledby={headingId}
      data-slot="device-request"
      className={cn("ph-app", className)}
    >
      <div className="flex flex-col gap-[18px] px-5 pt-3 pb-[calc(140px+env(safe-area-inset-bottom,0px))]">
        <div>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="ph-h1 text-[26px] outline-none"
          >
            {t("requestTitle")}
          </h1>
          <p className="ph-lead">{t("requestLead")}</p>
        </div>

        <dl className="ph-dl">
          <div className="col-span-2">
            <dt>{t("terms.code")}</dt>
            <dd
              data-slot="device-request-code"
              className="ph-mono text-[20px] tracking-[0.08em]"
            >
              {userCode}
            </dd>
          </div>
          <div className="min-w-0">
            <dt>{t("terms.device")}</dt>
            <dd data-slot="device-request-name" className="break-words">
              {request.device_name}
            </dd>
          </div>
          <div className="min-w-0">
            <dt>{t("terms.client")}</dt>
            <dd className="break-words">{request.client_label}</dd>
          </div>
          <div className="min-w-0">
            <dt>{t("terms.ip")}</dt>
            {request.ip ? (
              <dd className="ph-mono break-all">{request.ip}</dd>
            ) : (
              <dd className="text-muted-foreground">{t("notRecorded")}</dd>
            )}
          </div>
          <div className="min-w-0">
            <dt>{t("terms.requested")}</dt>
            <dd>
              <Time iso={request.requested_at} />
            </dd>
          </div>
          <div className="col-span-2">
            <dt>{t("terms.expires")}</dt>
            <dd>
              <Time iso={request.expires_at} />
            </dd>
          </div>
        </dl>

        <div
          role="note"
          data-slot="device-request-warning"
          className="ph-device-note"
        >
          <TriangleAlert
            size={18}
            aria-hidden="true"
            className="mt-px flex-none text-warning"
          />
          <div className="text-[14px] leading-[1.45]">
            <p className="m-0 font-semibold">{t("warning")}</p>
            <p className="mt-0.5 mb-0 text-muted-foreground">
              {t("warningDetail")}
            </p>
          </div>
        </div>

        {onUseDifferentCode ? (
          <button
            type="button"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) onUseDifferentCode();
            }}
            className="min-h-11 cursor-pointer scroll-mb-[calc(120px+env(safe-area-inset-bottom,0px))] self-center border-0 bg-transparent px-1.5 py-px text-[14px] font-semibold text-primary aria-disabled:opacity-60"
          >
            {t("differentCode")}
          </button>
        ) : null}
      </div>

      <PhoneActionBar className="flex-wrap gap-y-0">
        <div role="alert" data-slot="device-request-error" className="w-full">
          {error ? (
            <p className="mt-0 mb-2 flex items-start gap-2 text-[14px] leading-[1.45]">
              <CircleAlert
                size={16}
                aria-hidden="true"
                className="mt-0.5 flex-none text-(color:--destructive-text)"
              />
              <span className="min-w-0">{error}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-disabled={busy || undefined}
          aria-busy={pending === "deny" || undefined}
          onClick={() => {
            if (!busy) onDeny();
          }}
          className={cn("ph-btn ph-dan flex-1", BUSY)}
        >
          {pending === "deny" ? SPINNER : null}
          {t("deny")}
        </button>
        <button
          type="button"
          aria-disabled={busy || undefined}
          aria-busy={pending === "approve" || undefined}
          onClick={() => {
            if (!busy) onApprove();
          }}
          className={cn("ph-btn ph-pri flex-1", BUSY)}
        >
          {pending === "approve" ? SPINNER : null}
          {t("approve")}
        </button>
      </PhoneActionBar>
    </section>
  );
}

export function PhoneDeviceOutcome({
  outcome,
  onStartOver,
  className,
}: DeviceOutcomeProps) {
  const t = useTranslations("device");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const approved = outcome === "approved";
  useFocusIfLost(headingRef);

  return (
    <section
      role="status"
      data-slot="device-outcome"
      data-outcome={outcome}
      className={cn(
        "ph-app ph-below-top flex flex-col items-center justify-center gap-3.5 px-6 pb-20 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-16 items-center justify-center rounded-full",
          approved
            ? "bg-primary-muted text-primary"
            : "bg-muted text-foreground",
        )}
      >
        {approved ? (
          <Check size={30} strokeWidth={2.5} />
        ) : (
          <X size={30} strokeWidth={2.5} />
        )}
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="m-0 text-[20px] leading-[1.35] font-semibold outline-none"
      >
        {approved ? t("approved") : t("denied")}
      </h1>
      {approved ? (
        <Link href={DEVICES_HREF} className="ph-btn ph-sec mt-2">
          {t("seeDevices")}
        </Link>
      ) : onStartOver ? (
        <button
          type="button"
          onClick={onStartOver}
          className="ph-btn ph-sec mt-2"
        >
          {t("anotherCode")}
        </button>
      ) : null}
    </section>
  );
}
