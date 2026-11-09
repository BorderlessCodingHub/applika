"use client";

import { useRef } from "react";
import { CircleAlert, Info, Loader2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { JobRunNotice } from "@/components/admin/job-run-controls";
import {
  formatJobLastRun,
  type JobRunStatus,
} from "@/components/admin/job-sources-copy";
import type { JobSourceRow } from "@/components/admin/job-sources-table";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import type { PhonePillTone } from "@/components/phone/phone-pill";
import { PhoneSwitch } from "@/components/phone/phone-switch";
import { cn } from "@/lib/utils";

export interface AdminJobSourcesScreenViewProps {
  /** `useAdminJobSources()`. */
  sources: PhoneLoad<readonly JobSourceRow[]>;
  /** A background refetch (after Run now or a switch): the cards dim, `aria-busy`. */
  refreshing: boolean;
  /** Not called while that source's own PATCH is pending. */
  onEnabledChange: (source: JobSourceRow, enabled: boolean) => void;
  /** Ids whose PATCH is in flight: their switch shows the requested value, `aria-disabled`. */
  pendingIds: readonly string[];
  onRunNow: () => void;
  /** The POST is in flight; the words stay "Run now". */
  startingRun: boolean;
  /** The 409/503 words, until the next Run now or a dismiss. */
  notice: JobRunNotice | null;
  onDismissNotice: () => void;
  /** "Today"/"Yesterday" are relative to it. */
  now?: Date;
}

const STATUS_TONE: Record<JobRunStatus, PhonePillTone> = {
  ok: "ok",
  blocked: "warn",
  failed: "bad",
};

/** v2/Admin's Jobs below md (under `AdminPhoneHeader`): props in, the board out. */
export function AdminJobSourcesScreenView({
  sources,
  refreshing,
  onEnabledChange,
  pendingIds,
  onRunNow,
  startingRun,
  notice,
  onDismissNotice,
  now,
}: AdminJobSourcesScreenViewProps) {
  const t = useTranslations("admin.jobs");
  const runNow = useRef<HTMLButtonElement>(null);

  return (
    <div data-slot="phone-admin-jobs" className="ph-app ph-ad-body ph-ad-list">
      {/* The board draws no section title: the chip names it; this h2 keeps the outline. */}
      <h2 className="ph-sr">{t("title")}</h2>
      <p className="ph-hint">{t("description")}</p>

      <PhoneLoadable
        state={sources}
        className="ph-ad-list-cards"
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="h-[124px]" />
            <PhoneSkeletonCard className="h-[124px]" />
          </PhoneSkeleton>
        }
      >
        {(rows) =>
          rows.length === 0 ? (
            <div data-slot="job-sources-empty" className="ph-card ph-ad-src">
              <p className="ph-ad-src-name">{t("emptyTitle")}</p>
              <p className="ph-hint">{t("emptyBody")}</p>
            </div>
          ) : (
            <ul
              data-slot="job-sources"
              aria-busy={refreshing || undefined}
              data-refreshing={refreshing || undefined}
              className="ph-ad-cards"
            >
              {rows.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  pending={pendingIds.includes(source.id)}
                  onEnabledChange={onEnabledChange}
                  now={now}
                />
              ))}
            </ul>
          )
        }
      </PhoneLoadable>

      {/* Pending keeps focus: aria-disabled, not disabled. */}
      <button
        ref={runNow}
        type="button"
        data-slot="job-run-now"
        aria-disabled={startingRun || undefined}
        aria-busy={startingRun || undefined}
        data-pending={startingRun ? "" : undefined}
        data-disabled={startingRun || undefined}
        className="ph-btn ph-pri"
        onClick={() => {
          if (!startingRun) onRunNow();
        }}
      >
        {startingRun ? (
          <Loader2 size={16} aria-hidden="true" className="ph-spin" />
        ) : null}
        {t("runNow")}
      </button>

      {/* Always mounted, so the 409/503 words are announced. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-slot="job-run-notice-region"
        className="empty:hidden"
      >
        {notice ? (
          <div
            data-slot="job-run-notice"
            data-tone={notice.tone}
            className="ph-notice"
          >
            {notice.tone === "error" ? (
              <CircleAlert
                size={16}
                aria-hidden="true"
                className="ph-notice-ic"
              />
            ) : (
              <Info size={16} aria-hidden="true" className="ph-notice-ic" />
            )}
            <p data-slot="job-run-notice-message">{notice.message}</p>
            <button
              type="button"
              aria-label={t("dismissNotice")}
              className="ph-hit ph-notice-close"
              onClick={() => {
                onDismissNotice();
                runNow.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  pending,
  onEnabledChange,
  now,
}: {
  source: JobSourceRow;
  pending: boolean;
  onEnabledChange: (source: JobSourceRow, enabled: boolean) => void;
  now?: Date;
}) {
  const t = useTranslations("admin.jobs");
  const format = useFormatter();
  const status = source.last_run_status;

  return (
    <li
      data-slot="job-source-row"
      data-source-code={source.code}
      data-enabled={source.is_enabled}
      className="ph-card ph-ad-src"
    >
      <div className="ph-ad-src-head">
        <span className="ph-ad-src-name">{source.name}</span>
        {pending ? (
          <Loader2
            size={14}
            aria-hidden="true"
            className="ph-spin ph-ad-src-pending"
          />
        ) : null}
        <PhoneSwitch
          checked={source.is_enabled}
          aria-label={t("switchLabel", { name: source.name })}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          data-slot="job-source-switch"
          onCheckedChange={(next) => {
            if (!pending) onEnabledChange(source, next);
          }}
        />
      </div>
      <dl className="ph-ad-src-dl">
        <div>
          <dt>{t("columns.lastRun")}</dt>
          <dd className="ph-ad-src-strong">
            {source.last_run_at ? (
              <time dateTime={source.last_run_at}>
                {formatJobLastRun(source.last_run_at, now)}
              </time>
            ) : (
              t("never")
            )}
          </dd>
        </div>
        <div>
          <dt>{t("columns.status")}</dt>
          <dd>
            <span
              data-slot="job-source-outcome"
              data-status={status ?? "none"}
              className={cn("ph-pill", status && `ph-${STATUS_TONE[status]}`)}
            >
              <span className="truncate">
                {status ? t(`status.${status}`) : t("notRun")}
              </span>
            </span>
          </dd>
        </div>
        <div>
          <dt>{t("columns.listed")}</dt>
          <dd
            data-slot="job-source-listed"
            className="ph-mono ph-ad-src-strong"
          >
            {format.number(source.active_jobs)}
          </dd>
        </div>
      </dl>
      {source.last_run_error ? (
        <p data-slot="job-source-error" className="ph-hint ph-ad-src-error">
          {source.last_run_error}
        </p>
      ) : null}
    </li>
  );
}
