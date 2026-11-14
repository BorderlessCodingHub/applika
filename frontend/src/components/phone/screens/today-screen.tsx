"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { getDisplayTime } from "@/components/agenda/agenda-view";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import { OpensOnCurrentCycle } from "@/components/phone/current-cycle-links";
import { PhoneCalendarPlus } from "@/components/phone/phone-icons";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import { PhoneTimelineDialog } from "@/components/phone/phone-timeline-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useApplications } from "@/hooks/use-applications";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useGeneralStats } from "@/hooks/use-statistics";
import { useAgenda } from "@/hooks/use-user";
import { useFormatNumber } from "@/i18n/format-number";
import { genAgendaStepIcsFile } from "@/lib/calendar";
import {
  agendaDay,
  agendaTimeToStart,
  companyInitials,
  greeting,
  initials as initialsOf,
  parseDayKey,
  stageTitleKey,
  upcomingAgenda,
  type DayPart,
  type TimeToStart,
} from "@/lib/phone-format";
import { attentionList } from "@/lib/pipeline";
import type { AgendaStep } from "@/services/types/applications";

export interface TodayNextInterview {
  applicationId: string;
  /** The stage's words (`stageLabel`), e.g. "Technical interview". */
  title: string;
  company: string;
  role: string;
  startsIn: TimeToStart;
  /** Local and already formatted ("14:00 – 15:00", or "14:00"); absent for an all-day step. */
  timeRange?: string;
}

export interface TodayUpcomingItem {
  /** The agenda item's id (the list key). */
  id: string;
  applicationId: string;
  /** The stage's words, e.g. "Initial screening". */
  title: string;
  company: string;
  /** The step's local calendar day (a local-midnight `Date`, never `new Date("YYYY-MM-DD")`). */
  date: Date;
  /** Local "HH:mm"; absent for an all-day step. */
  time?: string;
}

export interface TodayAgenda {
  /** The first interview starting at or after now; `null` shows no card. */
  next: TodayNextInterview | null;
  /** The ones after it (the board draws two; the plan says up to three). */
  upcoming: readonly TodayUpcomingItem[];
}

export interface TodayStats {
  active: number;
  offers: number;
  /** A percentage, as `GeneralStats.success_rate` sends it (5.9 is 5.9%). */
  successRate: number;
}

export interface TodayAttentionItem {
  applicationId: string;
  company: string;
  role: string;
  /** Whole days since the later of its application date and its latest event (> 14). */
  days: number;
}

export interface TodayScreenViewProps {
  /** The clock the date line reads (injectable for tests). */
  now: Date;
  greeting: { part: DayPart; name: string };
  /** Already uppercased (`initials()`). */
  initials: string;
  agenda: PhoneLoad<TodayAgenda>;
  stats: PhoneLoad<TodayStats>;
  /** Always the current cycle's open applications, most days first. */
  attention: PhoneLoad<readonly TodayAttentionItem[]>;
  /** Opens today's `TimelineEventDialog` in add mode. */
  onLogUpdate: (applicationId: string) => void;
  /** Opens today's `TimelineEventDialog` in close mode. */
  onCloseApplication: (applicationId: string) => void;
  onAddToCalendar: (next: TodayNextInterview) => void;
}

const focusHref = (applicationId: string) =>
  `/applications?focus=${encodeURIComponent(applicationId)}`;

/** v2/Today below md: props in, the board out. */
export function TodayScreenView({
  now,
  greeting,
  initials,
  agenda,
  stats,
  attention,
  onLogUpdate,
  onCloseApplication,
  onAddToCalendar,
}: TodayScreenViewProps) {
  const t = useTranslations("phone.today");
  const tNav = useTranslations("nav");
  const tApplications = useTranslations("applications.list");
  const tAgenda = useTranslations("agenda.page");
  const format = useFormatter();
  const locale = useLocale();
  const attentionId = useId();
  const upcomingId = useId();

  const dateLine = capitalize(
    format.dateTime(now, { weekday: "long", month: "long", day: "numeric" }),
    locale,
  );

  return (
    <div data-slot="phone-today" className="ph-app ph-today">
      <div className="ph-today-head">
        <div className="ph-today-greet">
          <p className="ph-today-date">{dateLine}</p>
          <h1 className="ph-today-h1">
            {t(`greeting.${greeting.part}`, { name: greeting.name })}
          </h1>
        </div>
        <PhoneAvatar initials={initials} />
      </div>

      {agenda.status === "ready" && agenda.data.next ? (
        <NextInterviewCard
          next={agenda.data.next}
          onAddToCalendar={onAddToCalendar}
        />
      ) : null}

      <PhoneLoadable
        state={stats}
        loading={
          <PhoneSkeleton label={t("stats.loading")}>
            <PhoneSkeletonCard className="h-[84px]" />
          </PhoneSkeleton>
        }
      >
        {(data) => <StatsLink stats={data} />}
      </PhoneLoadable>

      <section aria-labelledby={attentionId} data-slot="today-attention">
        <div className="ph-sec-head">
          <h2 id={attentionId} className="ph-h2">
            {t("attention.title")}
          </h2>
          {attention.status === "ready" ? (
            <span className="ph-mono ph-sec-count">
              {attention.data.length}
            </span>
          ) : null}
        </div>
        <PhoneLoadable
          state={attention}
          className="mt-3"
          loading={
            <PhoneSkeleton label={tApplications("loading")}>
              <PhoneSkeletonCard className="h-[154px]" />
            </PhoneSkeleton>
          }
        >
          {(items) =>
            items.length > 0 ? (
              <ul className="ph-attn-list">
                {items.map((item) => (
                  <AttentionCard
                    key={item.applicationId}
                    item={item}
                    onLogUpdate={onLogUpdate}
                    onCloseApplication={onCloseApplication}
                  />
                ))}
              </ul>
            ) : (
              <p className="ph-caught-up">{t("attention.caughtUp")}</p>
            )
          }
        </PhoneLoadable>
      </section>

      <section aria-labelledby={upcomingId} data-slot="today-upcoming">
        <div className="ph-sec-head">
          <h2 id={upcomingId} className="ph-h2">
            {t("upcoming.title")}
          </h2>
          <Link href="/agenda" className="ph-sec-link">
            {tNav("agenda")}
          </Link>
        </div>
        <PhoneLoadable
          state={agenda}
          className="mt-1"
          loading={
            <PhoneSkeleton label={tAgenda("loading")}>
              <PhoneSkeletonCard className="h-32" />
            </PhoneSkeleton>
          }
        >
          {({ next, upcoming }) =>
            upcoming.length > 0 ? (
              <ul className="ph-group ph-up-list">
                {upcoming.map((item) => (
                  <UpcomingRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="ph-caught-up">
                {next ? t("upcoming.noMore") : t("upcoming.none")}
              </p>
            )
          }
        </PhoneLoadable>
      </section>
    </div>
  );
}

function NextInterviewCard({
  next,
  onAddToCalendar,
}: {
  next: TodayNextInterview;
  onAddToCalendar: (next: TodayNextInterview) => void;
}) {
  const t = useTranslations("phone.today");
  const format = useFormatter();
  const titleId = useId();
  const subId = useId();

  const when =
    next.startsIn.kind === "later"
      ? format.dateTime(next.startsIn.date, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : startsIn(next.startsIn.minutes);

  function startsIn(minutes: number): string {
    const whole = Math.max(1, Math.ceil(minutes));
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    if (hours === 0) return t("startsIn.minutes", { minutes: rest });
    if (rest === 0) return t("startsIn.hours", { hours });
    return t("startsIn.hoursMinutes", { hours, minutes: rest });
  }

  return (
    <section
      aria-labelledby={titleId}
      data-slot="today-next-interview"
      data-application-id={next.applicationId}
      className="ph-hero"
    >
      <p className="ph-hero-eyebrow">
        <span aria-hidden="true" className="ph-hero-dot" />
        <span className="ph-hero-when">{t("nextInterview", { when })}</span>
      </p>
      <h2 id={titleId} className="ph-hero-title">
        {next.title}
      </h2>
      <p id={subId} className="ph-hero-sub">
        {next.company} · {next.role}
      </p>
      <div className="ph-hero-actions">
        <span className="ph-mono ph-hero-range">{next.timeRange}</span>
        {/* The two actions wrap together below ~360px. */}
        <span className="ph-hero-btns">
          <button
            type="button"
            aria-label={t("addToCalendar")}
            aria-describedby={titleId}
            className="ph-hero-cal"
            onClick={() => onAddToCalendar(next)}
          >
            <PhoneCalendarPlus size={18} aria-hidden="true" />
          </button>
          <Link
            href={focusHref(next.applicationId)}
            aria-describedby={`${titleId} ${subId}`}
            className="ph-hero-open"
          >
            {t("open")}
          </Link>
        </span>
      </div>
    </section>
  );
}

function StatsLink({ stats }: { stats: TodayStats }) {
  const t = useTranslations("phone.today.stats");
  const formatNumber = useFormatNumber();
  // The board writes one decimal ("5.9%"); a whole rate keeps none.
  const rate = formatNumber(Math.round(stats.successRate * 10) / 10);

  return (
    <Link href="/insights" data-slot="today-stats" className="ph-stats">
      <span>
        <span className="ph-mono ph-stats-num">
          {formatNumber(stats.active)}
        </span>
        <span className="ph-stats-lbl">{t("active")}</span>
      </span>
      <span>
        <span className="ph-mono ph-stats-num ph-pri">
          {formatNumber(stats.offers)}
        </span>
        <span className="ph-stats-lbl">{t("offers")}</span>
      </span>
      <span>
        <span className="ph-mono ph-stats-num">{rate}%</span>
        <span className="ph-stats-lbl">{t("success")}</span>
      </span>
      <ChevronRight
        size={18}
        role="img"
        aria-label={t("seeInsights")}
        className="ph-stats-go"
      />
    </Link>
  );
}

function AttentionCard({
  item,
  onLogUpdate,
  onCloseApplication,
}: {
  item: TodayAttentionItem;
  onLogUpdate: (applicationId: string) => void;
  onCloseApplication: (applicationId: string) => void;
}) {
  const t = useTranslations("phone.today.attention");
  const companyId = useId();
  const roleId = useId();
  const describedBy = `${companyId} ${roleId}`;

  return (
    <li
      data-slot="today-attention-item"
      data-application-id={item.applicationId}
      className="ph-card"
    >
      <div className="ph-attn-head">
        <span aria-hidden="true" className="ph-tile">
          {companyInitials(item.company)}
        </span>
        <div className="ph-attn-text">
          <div id={companyId} className="ph-attn-company">
            {item.company}
          </div>
          <div id={roleId} className="ph-attn-role">
            {item.role}
          </div>
        </div>
      </div>
      <p className="ph-attn-quiet">
        <Clock size={14} aria-hidden="true" className="ph-attn-clock" />
        {t("quiet", { days: item.days })}
      </p>
      <div className="ph-attn-actions">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-describedby={describedBy}
          data-action="log-update"
          className="ph-ghost"
          onClick={() => onLogUpdate(item.applicationId)}
        >
          {t("logUpdate")}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-describedby={describedBy}
          data-action="close-application"
          className="ph-ghost"
          onClick={() => onCloseApplication(item.applicationId)}
        >
          {t("closeIt")}
        </button>
      </div>
    </li>
  );
}

function UpcomingRow({ item }: { item: TodayUpcomingItem }) {
  const format = useFormatter();
  const locale = useLocale();
  const titleId = useId();
  const companyId = useId();
  const whenId = useId();

  // The board's "TUE": the short weekday, uppercased, without pt-BR's trailing dot.
  const weekday = format
    .dateTime(item.date, { weekday: "short" })
    .replace(/\.$/, "")
    .toLocaleUpperCase(locale);
  const fullDate = format.dateTime(item.date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <li>
      <Link
        href={focusHref(item.applicationId)}
        aria-labelledby={titleId}
        aria-describedby={`${companyId} ${whenId}`}
        data-slot="today-upcoming-item"
        data-application-id={item.applicationId}
        className="ph-up-row"
      >
        <span aria-hidden="true" className="ph-up-date">
          <span className="ph-up-dow">{weekday}</span>
          <span className="ph-mono ph-up-day">
            {format.dateTime(item.date, { day: "numeric" })}
          </span>
        </span>
        <span className="ph-up-text">
          <span id={titleId} className="ph-up-title">
            {item.title}
          </span>
          <span id={companyId} className="ph-up-sub">
            {item.company}
          </span>
        </span>
        {item.time ? (
          <span aria-hidden="true" className="ph-mono ph-up-time">
            {item.time}
          </span>
        ) : null}
        <span id={whenId} className="ph-sr">
          {item.time ? `${fullDate}, ${item.time}` : fullDate}
        </span>
      </Link>
    </li>
  );
}

function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Coming up lists this many after the next interview (plan 0021). */
export const TODAY_UPCOMING_COUNT = 3;

/** "14:00 – 15:00", "14:00", or nothing for an all-day step (local times, `getDisplayTime`). */
export function agendaTimeRange(step: AgendaStep): string | undefined {
  const display = getDisplayTime(step);
  if (!display) return undefined;
  return display.endTime
    ? `${display.time} – ${display.endTime}`
    : display.time;
}

/**
 * v2/Today, wired: the greeting, the next interview and Coming up
 * from `useAgenda()`, the three numbers from `useGeneralStats(null)`, and
 * "Needs your attention" from `useApplications(null)` — the CURRENT cycle,
 * whatever cycle the rest of the app is viewing (PRD 0021 edge case). Log
 * update and Close it open today's timeline event dialog.
 */
export function TodayScreen() {
  const tStage = useTranslations("phone.stageTitle");
  const tAgenda = useTranslations("agenda");
  const { user } = useAuth();
  // Protected pages render after auth: `user` is there; the blank one only types it.
  const named = user ?? { username: "" };
  const now = useMinuteClock();
  const general = useGeneralStats(null);
  const agendaQuery = useAgenda();
  const apps = useApplications(null);
  const [dialog, setDialog] = useState<{
    applicationId: string;
    purpose: "event" | "close";
  } | null>(null);

  const upcoming = agendaQuery.data
    ? upcomingAgenda(agendaQuery.data, now)
    : [];
  const nextStep = upcoming[0] ?? null;

  const agenda = mapLoad(
    fromQuery(agendaQuery),
    (): TodayAgenda => ({
      next: nextStep
        ? {
            applicationId: nextStep.application_id,
            title: tStage(
              stageTitleKey(nextStep.event_type, nextStep.interview_type),
            ),
            company: nextStep.company_name,
            role: nextStep.role,
            startsIn: agendaTimeToStart(nextStep, now),
            timeRange: agendaTimeRange(nextStep),
          }
        : null,
      upcoming: upcoming.slice(1, 1 + TODAY_UPCOMING_COUNT).map((step) => ({
        id: step.id,
        applicationId: step.application_id,
        title: tStage(stageTitleKey(step.event_type, step.interview_type)),
        company: step.company_name,
        date: parseDayKey(agendaDay(step)),
        time: getDisplayTime(step)?.time,
      })),
    }),
  );

  const stats = mapLoad(
    fromQuery(general),
    (data): TodayStats => ({
      active: data.active,
      offers: data.offers,
      successRate: data.success_rate,
    }),
  );

  const attention = mapLoad(
    fromQuery({
      data: apps.applications,
      isError: apps.isError,
      error: apps.error,
      isFetching: apps.isFetching,
      refetch: apps.refetch,
    }),
    (list): TodayAttentionItem[] =>
      attentionList(list, now).map(({ app, days }) => ({
        applicationId: app.id,
        company: app.company_name,
        role: app.role,
        days,
      })),
  );

  return (
    <OpensOnCurrentCycle>
      <TodayScreenView
        now={now}
        greeting={greeting(now, named)}
        initials={user ? initialsOf(user) : ""}
        agenda={agenda}
        stats={stats}
        attention={attention}
        onLogUpdate={(applicationId) =>
          setDialog({ applicationId, purpose: "event" })
        }
        onCloseApplication={(applicationId) =>
          setDialog({ applicationId, purpose: "close" })
        }
        onAddToCalendar={() => {
          if (!nextStep) return;
          genAgendaStepIcsFile(nextStep);
          toast.success(tAgenda("downloaded"));
        }}
      />
      {dialog ? (
        <PhoneTimelineDialog
          key={`${dialog.purpose}-${dialog.applicationId}`}
          applicationId={dialog.applicationId}
          purpose={dialog.purpose}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          opener={() =>
            document.querySelector<HTMLElement>(
              `[data-slot="today-attention-item"][data-application-id="${dialog.applicationId}"] [data-action="${dialog.purpose === "close" ? "close-application" : "log-update"}"]`,
            )
          }
          // The card left the list (closed, or updated): the list itself.
          fallbackFocus={() =>
            document.querySelector<HTMLElement>(
              '[data-slot="today-attention"] [data-slot="phone-loadable"]',
            )
          }
        />
      ) : null}
    </OpensOnCurrentCycle>
  );
}
