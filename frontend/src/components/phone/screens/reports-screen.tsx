"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { PhoneGroup } from "@/components/phone/phone-group";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill, type PhonePillTone } from "@/components/phone/phone-pill";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import type { BadgeGateClosed } from "@/components/badges/badge-gate";
import { useCycleContext } from "@/contexts/cycle-context";
import { useReports } from "@/hooks/use-repports";
import { addDays, parseDayKey } from "@/lib/phone-format";
import { REPORT_PHASE, effectiveReportStatus } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportDays, type ReportsResponse } from "@/services/types/reports";

export type ReportsItemStatus = "pending" | "overdue" | "submitted" | "future";

export interface ReportsItem {
  day: number;
  phase: number;
  /** Today's effective status: overdue within 14 days of its day reads pending. */
  status: ReportsItemStatus;
  /** `/reports/<day>`. */
  href: string;
}

export interface ReportsCurrentItem extends ReportsItem {
  status: "pending" | "overdue";
  /** The report's day on the calendar (challenge start + day - 1), local midnight; `null` unknown. */
  due: Date | null;
}

export interface ReportsData {
  /** `current_day`; 0 before the first report. */
  currentDay: number;
  /** The challenge's length: the last report day (120). */
  totalDays: number;
  /** The one report the API marks pending or overdue (the next to submit), if any. */
  current: ReportsCurrentItem | null;
  submitted: readonly ReportsItem[];
  upcoming: readonly ReportsItem[];
}

export interface ReportsScreenViewProps {
  reports: PhoneLoad<ReportsData>;
  /** An archived cycle is viewed: no Fill Report (today's "Not available"). */
  canFill: boolean;
}

const STATUS_PILL: Record<
  Exclude<ReportsItemStatus, "future">,
  { tone: PhonePillTone; dot: string }
> = {
  pending: { tone: "warn", dot: "var(--warning)" },
  overdue: { tone: "bad", dot: "var(--destructive-text)" },
  submitted: { tone: "ok", dot: "var(--success)" },
};

/** A report's status as the boards draw it: a toned pill with its dot. */
export function ReportStatusPill({
  status,
  className,
}: {
  status: Exclude<ReportsItemStatus, "future">;
  className?: string;
}) {
  const t = useTranslations("reports.status");
  const { tone, dot } = STATUS_PILL[status];
  return (
    <PhonePill tone={tone} dot={dot} className={className}>
      {t(status)}
    </PhonePill>
  );
}

/** v2/Reports (member) below md: props in, the board out. */
export function ReportsScreenView({
  reports,
  canFill,
}: ReportsScreenViewProps) {
  const t = useTranslations("reports.list");
  const tPhone = useTranslations("phone.reports");
  const format = useFormatter();
  const currentId = useId();
  const submittedId = useId();
  const upcomingId = useId();

  return (
    <div data-slot="phone-reports" className="ph-app ph-rp">
      <div>
        <h1 className="ph-h1">
          {t.rich("title", {
            accent: (chunks) => <span className="ph-rp-accent">{chunks}</span>,
          })}
        </h1>
        {reports.status === "ready" ? (
          <>
            <p className="ph-lead ph-rp-lead">
              {t.rich("progress", {
                day: reports.data.currentDay,
                em: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <div
              role="progressbar"
              aria-label={tPhone("progress")}
              aria-valuemin={0}
              aria-valuemax={reports.data.totalDays}
              aria-valuenow={Math.min(
                reports.data.currentDay,
                reports.data.totalDays,
              )}
              className="ph-rp-progress"
            >
              <span
                style={{
                  width: `${Math.min(100, (reports.data.currentDay / reports.data.totalDays) * 100)}%`,
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      <p className="ph-rp-tip">
        {tPhone.rich("tip", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <PhoneLoadable
        state={reports}
        className="ph-rp-sections"
        loading={
          <PhoneSkeleton label={tPhone("loading")}>
            <PhoneSkeletonCard className="h-[150px]" />
            <PhoneSkeletonCard className="h-[170px]" />
          </PhoneSkeleton>
        }
      >
        {(data) => (
          <>
            {data.current ? (
              <section aria-labelledby={currentId} data-slot="reports-current">
                <h2 id={currentId} className="ph-gh">
                  {t("current")}
                </h2>
                <div
                  data-day={data.current.day}
                  data-status={data.current.status}
                  className="ph-card ph-rp-current"
                >
                  <div className="ph-rp-current-head">
                    <span className="ph-rp-day">
                      {t("day", { day: data.current.day })}
                    </span>
                    <ReportStatusPill status={data.current.status} />
                  </div>
                  <p className="ph-rp-meta">
                    {data.current.due
                      ? tPhone("phaseDue", {
                          phase: data.current.phase,
                          date: format.dateTime(data.current.due, {
                            month: "short",
                            day: "numeric",
                          }),
                        })
                      : t("phase", { phase: data.current.phase })}
                  </p>
                  {canFill ? (
                    <Link
                      href={data.current.href}
                      data-action="fill-report"
                      className="ph-btn ph-sm ph-pri"
                    >
                      {t("fill")}
                    </Link>
                  ) : (
                    <p className="ph-rp-meta">{t("notAvailable")}</p>
                  )}
                </div>
              </section>
            ) : null}

            {data.submitted.length > 0 ? (
              <section
                aria-labelledby={submittedId}
                data-slot="reports-submitted"
              >
                <h2 id={submittedId} className="ph-gh">
                  {t("submitted")}
                </h2>
                <PhoneGroup>
                  {data.submitted.map((report) => (
                    <li key={report.day}>
                      <Link
                        href={report.href}
                        data-day={report.day}
                        className="ph-row"
                      >
                        <span className="ph-grow">
                          <span className="ph-rp-row-title">
                            {t("day", { day: report.day })}
                          </span>
                          <span className="ph-rp-sub">
                            {t("phase", { phase: report.phase })}
                          </span>
                        </span>
                        <ReportStatusPill status="submitted" />
                      </Link>
                    </li>
                  ))}
                </PhoneGroup>
              </section>
            ) : null}

            {data.upcoming.length > 0 ? (
              <section
                aria-labelledby={upcomingId}
                data-slot="reports-upcoming"
              >
                <h2 id={upcomingId} className="ph-gh">
                  {t("upcoming")}
                </h2>
                <PhoneGroup>
                  {data.upcoming.map((report) => (
                    <li
                      key={report.day}
                      data-day={report.day}
                      className="ph-row ph-rp-future"
                    >
                      <span className="ph-grow">
                        {tPhone("dayPhase", {
                          day: report.day,
                          phase: report.phase,
                        })}
                      </span>
                      <span className="ph-rp-na">{t("notAvailable")}</span>
                    </li>
                  ))}
                </PhoneGroup>
              </section>
            ) : null}
          </>
        )}
      </PhoneLoadable>
    </div>
  );
}

export interface ReportsClosedViewProps {
  /** `membershipAccess(user).state` when it is not `held`. */
  reason: "none" | "needs_reconnect";
  /** Borderless home (`APP_CONFIG.borderless.homeUrl`); "Visit Borderless" links to it. */
  borderlessHref?: string;
  /** `logout("/login")`. */
  onSignInAgain: () => void;
}

/**
 * v2/Reports `gated` below md: why Reports are closed, and the way out
 * (today's `BadgeGate` words). `none` is the board's two actions; while a
 * recorded badge waits for a new sign-in (AUTH-1050) the way out is "Sign in
 * again" alone.
 */
export function ReportsClosedView({
  reason,
  borderlessHref,
  onSignInAgain,
}: ReportsClosedViewProps) {
  const t = useTranslations("badges.gate");
  const tErrors = useTranslations("errors");
  const heading = useRef<HTMLHeadingElement>(null);
  const leadId = useId();
  const reconnect = reason === "needs_reconnect";

  // Reached mid-page (a report request answered 403 AUTH-1050), the reports
  // unmount with focus inside them: land on this h1 instead of <body>.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) heading.current?.focus();
  }, []);

  return (
    <div
      data-slot="reports-closed"
      data-reason={reason}
      className="ph-app ph-below-top ph-rp-closed"
    >
      <span aria-hidden="true" className="ph-rp-lock">
        <Lock size={26} />
      </span>
      <h1
        ref={heading}
        tabIndex={-1}
        className="ph-h1 ph-rp-closed-h1 ph-focus-target"
      >
        {reconnect ? t("reconnectTitle") : t("noBadgeTitle")}
      </h1>
      <p id={leadId} className="ph-lead">
        {reconnect ? tErrors("AUTH-1050") : t("noBadgeWhy")}
      </p>
      {reconnect ? null : (
        <p className="ph-hint ph-rp-closed-hint">{t("noBadgeRecent")}</p>
      )}
      <div className="ph-rp-closed-actions">
        {!reconnect && borderlessHref ? (
          <a
            href={borderlessHref}
            target="_blank"
            rel="noopener noreferrer"
            data-action="visit-borderless"
            className="ph-btn ph-pri"
          >
            {t("visitBorderless")}
            <span className="ph-sr">{t("opensInNewTab")}</span>
          </a>
        ) : null}
        <button
          type="button"
          data-action="badge-gate-sign-in-again"
          aria-describedby={reconnect ? leadId : undefined}
          className={cn("ph-btn", reconnect ? "ph-pri" : "ph-sec")}
          onClick={onSignInAgain}
        >
          {t("signInAgain")}
        </button>
      </div>
    </div>
  );
}

/** The challenge's last report day (120). */
export const REPORT_TOTAL_DAYS: number = ReportDays.at(-1) ?? 120;

/** `/reports/<day>`. */
export function reportDayHref(day: number): string {
  return `/reports/${day}`;
}

/**
 * The list the API sends as the board's sections: the one report the API
 * marks pending or overdue (today's effective status: overdue within 14
 * days reads pending) with its due day (challenge start + day - 1), the
 * submitted ones and the upcoming ones, in day order.
 */
export function reportsData(response: ReportsResponse): ReportsData {
  const currentDay = response.current_day;
  const start = response.start_date ? parseDayKey(response.start_date) : null;
  const item = (day: ReportsItem["day"], status: ReportsItemStatus) => ({
    day,
    phase: REPORT_PHASE[day as keyof typeof REPORT_PHASE] ?? 1,
    status,
    href: reportDayHref(day),
  });

  let current: ReportsCurrentItem | null = null;
  const submitted: ReportsItem[] = [];
  const upcoming: ReportsItem[] = [];
  for (const report of response.reports) {
    const status = effectiveReportStatus(report, currentDay);
    if (status === "submitted") {
      submitted.push(item(report.day, "submitted"));
    } else if (status === "future") {
      upcoming.push(item(report.day, "future"));
    } else if (current === null) {
      current = {
        ...item(report.day, status),
        status,
        due: start ? addDays(start, report.day - 1) : null,
      };
    }
  }
  return {
    currentDay,
    totalDays: REPORT_TOTAL_DAYS,
    current,
    // Newest first, as the board lists them.
    submitted: submitted.reverse(),
    upcoming,
  };
}

/**
 * v2/Reports with its data (`/reports` below md, inside `BadgeGate`, so no
 * report request leaves without a held badge): the viewed cycle's reports.
 * An archived cycle shows "Not available" instead of Fill Report, as today.
 */
export function ReportsScreen() {
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();
  const query = useReports(selectedCycleId);

  return (
    <ReportsScreenView
      reports={mapLoad(
        fromQuery({
          data: query.data,
          isError: query.isError,
          error: query.error,
          isFetching: query.isValidating,
          refetch: query.refetch,
        }),
        reportsData,
      )}
      canFill={!isViewingPastCycle}
    />
  );
}

/** `BadgeGate`'s `closed` on the phone: the board's closed layout. */
export function renderReportsClosed(gate: BadgeGateClosed) {
  return (
    <ReportsClosedView
      reason={gate.state}
      borderlessHref={gate.borderlessHref}
      onSignInAgain={gate.onSignInAgain}
    />
  );
}
