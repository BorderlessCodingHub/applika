"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Tabs as TabsPrimitive } from "radix-ui";
import { toast } from "sonner";
import {
  agendaStartInstant,
  getDisplayTime,
  getUserTimezone,
  isStepPast,
} from "@/components/agenda/agenda-view";
import { OpensOnCurrentCycle } from "@/components/phone/current-cycle-links";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import { PhoneBell, PhoneCalendarPlus } from "@/components/phone/phone-icons";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import type { TodayUpcomingItem } from "@/components/phone/screens/today-screen";
import { useAgendaNotifications } from "@/contexts/agenda-notifications-context";
import { useAuth } from "@/contexts/auth-context";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useAgenda } from "@/hooks/use-user";
import { genAgendaStepIcsFile } from "@/lib/calendar";
import {
  addDays,
  agendaDay,
  agendaTimeToStart,
  dayKey,
  initials as initialsOf,
  mondayOf,
  parseDayKey,
  stagePillKey,
  stageTitleKey,
  type TimeToStart,
} from "@/lib/phone-format";
import type { AgendaStep } from "@/services/types/applications";

export interface AgendaWeekDay {
  /** The local calendar day, "YYYY-MM-DD": the day's tab value. */
  key: string;
  /** The same day at local midnight. */
  date: Date;
  /** The viewer's today. */
  today: boolean;
  /** The day has interviews (its dot); `false` while the week loads. */
  hasEvents: boolean;
}

/** When a card's interview starts ("in 2h 15m", "Tue, Oct 28"), or "Done" once it has. */
export type AgendaEventWhen = TimeToStart | { kind: "done" };

export interface AgendaEvent {
  /** The agenda item's id. */
  id: string;
  applicationId: string;
  /** The pill's words: the interview type ("Technical"), else the event type ("Offer"). */
  stage: string;
  role: string;
  company: string;
  /** Local "HH:mm" (`getDisplayTime`); absent for an all-day step. */
  time?: string;
  end?: string;
  /** With a start and an end: "30 min", "1 h". */
  durationMinutes?: number;
  when: AgendaEventWhen;
  notes?: string;
  /** Timed, not yet started items only (as the desktop): the sound-alert bell. */
  alert?: { enabled: boolean; onToggle: () => void };
}

/** A "Later" row: Today's Coming up row. */
export type AgendaLaterItem = TodayUpcomingItem;

export interface AgendaScreenViewProps {
  /** Already uppercased (`initials()`). */
  initials: string;
  /** Seven days, Monday first. */
  week: readonly AgendaWeekDay[];
  /** The chosen day's `key`; one of `week`. */
  selectedKey: string;
  onSelectDay: (key: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  /** The chosen day's interviews, in start order. */
  day: PhoneLoad<readonly AgendaEvent[]>;
  /** The next five after the chosen day. */
  later: PhoneLoad<readonly AgendaLaterItem[]>;
  /** Downloads the item's calendar file (`genAgendaStepIcsFile`). */
  onAddToCalendar: (eventId: string) => void;
}

const focusHref = (applicationId: string) =>
  `/applications?focus=${encodeURIComponent(applicationId)}`;

/** v2/Schedule (the Agenda) below md: props in, the board out. */
export function AgendaScreenView({
  initials,
  week,
  selectedKey,
  onSelectDay,
  onPreviousWeek,
  onNextWeek,
  day,
  later,
  onAddToCalendar,
}: AgendaScreenViewProps) {
  const t = useTranslations("phone.agenda");
  const tPage = useTranslations("agenda.page");
  const tUpcoming = useTranslations("phone.today.upcoming");
  const format = useFormatter();
  const locale = useLocale();
  const dayHeadingId = useId();
  const laterHeadingId = useId();

  const selected = week.find((d) => d.key === selectedKey) ?? week[0];
  // pt-BR's "sáb." and "out.": the board's "Sat" and "Oct" carry no dot.
  const short = (date: Date, part: "weekday" | "month") =>
    format
      .dateTime(
        date,
        part === "weekday" ? { weekday: "short" } : { month: "short" },
      )
      .replace(/\.$/, "");
  const weekLabel = week[0]
    ? t("weekOf", {
        date: format.dateTime(week[0].date, { month: "short", day: "numeric" }),
      })
    : undefined;
  const selectedDate = selected
    ? format.dateTime(selected.date, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <TabsPrimitive.Root
      value={selectedKey}
      onValueChange={onSelectDay}
      data-slot="phone-agenda"
      className="ph-app"
    >
      <div className="ph-ag-top">
        <div className="ph-ag-head">
          <h1 className="ph-h1">{tPage("title")}</h1>
          <PhoneAvatar initials={initials} />
        </div>
        <div className="ph-ag-month-row">
          <span className="ph-ag-month">
            {selected
              ? capitalize(
                  format.dateTime(selected.date, {
                    month: "long",
                    year: "numeric",
                  }),
                  locale,
                )
              : null}
          </span>
          <span className="ph-ag-nav">
            <button
              type="button"
              aria-label={t("previousWeek")}
              data-action="previous-week"
              className="ph-iconbtn"
              onClick={onPreviousWeek}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("nextWeek")}
              data-action="next-week"
              className="ph-iconbtn"
              onClick={onNextWeek}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </span>
        </div>
        {/* The week buttons keep focus: the new week is said here. */}
        <p aria-live="polite" className="ph-sr">
          {weekLabel}
        </p>
        <TabsPrimitive.List
          aria-label={weekLabel}
          data-slot="agenda-week"
          className="ph-ag-week"
        >
          {week.map((d) => (
            <TabsPrimitive.Trigger
              key={d.key}
              value={d.key}
              aria-label={t("day", {
                weekday: short(d.date, "weekday"),
                month: short(d.date, "month"),
                day: format.dateTime(d.date, { day: "numeric" }),
                today: d.today ? "yes" : "no",
                events: d.hasEvents ? "yes" : "no",
              })}
              data-day={d.key}
              data-today={d.today || undefined}
              data-events={d.hasEvents || undefined}
              className="ph-ag-day"
            >
              <span className="ph-ag-dow">{short(d.date, "weekday")}</span>
              <span className="ph-mono ph-ag-num">
                {format.dateTime(d.date, { day: "numeric" })}
              </span>
              <span aria-hidden="true" className="ph-ag-dot" />
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>

      <div className="ph-ag-main">
        {/* One panel, remounted per day. */}
        <TabsPrimitive.Content
          key={selectedKey}
          value={selectedKey}
          tabIndex={-1}
          asChild
        >
          <section aria-labelledby={dayHeadingId} data-slot="agenda-day">
            <h2 id={dayHeadingId} className="ph-ag-gh">
              {selected?.today
                ? t("dayTitleToday", { date: selectedDate })
                : selectedDate}
            </h2>
            <PhoneLoadable
              state={day}
              loading={
                <PhoneSkeleton label={tPage("loading")}>
                  <PhoneSkeletonCard className="ml-16 h-[188px]" />
                </PhoneSkeleton>
              }
            >
              {(events) =>
                events.length > 0 ? (
                  <div className="ph-ag-list">
                    {events.map((event) => (
                      <AgendaEventCard
                        key={event.id}
                        event={event}
                        onAddToCalendar={onAddToCalendar}
                      />
                    ))}
                  </div>
                ) : (
                  <p data-slot="agenda-day-empty" className="ph-ag-empty">
                    {t("emptyDay")}
                  </p>
                )
              }
            </PhoneLoadable>
          </section>
        </TabsPrimitive.Content>

        <section aria-labelledby={laterHeadingId} data-slot="agenda-later">
          <h2 id={laterHeadingId} className="ph-ag-gh">
            {t("later")}
          </h2>
          <PhoneLoadable
            state={later}
            loading={
              <PhoneSkeleton label={tPage("loading")}>
                <PhoneSkeletonCard className="h-32" />
              </PhoneSkeleton>
            }
          >
            {(items) =>
              items.length > 0 ? (
                <ul className="ph-group">
                  {items.map((item) => (
                    <LaterRow
                      key={item.id}
                      item={item}
                      shownMonth={selected?.date}
                    />
                  ))}
                </ul>
              ) : (
                <p data-slot="agenda-later-empty" className="ph-ag-empty">
                  {tUpcoming("none")}
                </p>
              )
            }
          </PhoneLoadable>
        </section>
      </div>
    </TabsPrimitive.Root>
  );
}

function AgendaEventCard({
  event,
  onAddToCalendar,
}: {
  event: AgendaEvent;
  onAddToCalendar: (eventId: string) => void;
}) {
  const t = useTranslations("phone.agenda");
  const tToday = useTranslations("phone.today");
  const tCard = useTranslations("agenda.card");
  const tNames = useTranslations("agenda.names");
  const format = useFormatter();
  const roleId = useId();
  const names = { role: event.role, company: event.company };

  const when =
    event.when.kind === "done"
      ? t("done")
      : event.when.kind === "later"
        ? format.dateTime(event.when.date, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : startsIn(event.when.minutes);

  function startsIn(minutes: number): string {
    const whole = Math.max(1, Math.ceil(minutes));
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    if (hours === 0) return tToday("startsIn.minutes", { minutes: rest });
    if (rest === 0) return tToday("startsIn.hours", { hours });
    return tToday("startsIn.hoursMinutes", { hours, minutes: rest });
  }

  const duration = durationWords(event.durationMinutes);
  const notes = event.notes?.trim();
  const timeWords = event.time
    ? event.end
      ? t("timeRange", { start: event.time, end: event.end })
      : event.time
    : tCard("allDay");

  function durationWords(total: number | undefined): string | null {
    if (total === undefined || total <= 0) return null;
    const hours = Math.floor(total / 60);
    const minutes = Math.round(total % 60);
    if (hours === 0) return t("duration.minutes", { minutes });
    if (minutes === 0) return t("duration.hours", { hours });
    return t("duration.hoursMinutes", { hours, minutes });
  }

  return (
    <article
      aria-labelledby={roleId}
      data-slot="agenda-event"
      data-event-id={event.id}
      data-application-id={event.applicationId}
      data-done={event.when.kind === "done" || undefined}
      className="ph-ag-ev"
    >
      <div className="ph-ag-when-col">
        <span className="ph-sr">{timeWords}</span>
        {event.time ? (
          <>
            <span aria-hidden="true" className="ph-mono ph-ag-time">
              {event.time}
            </span>
            {event.end ? (
              <span aria-hidden="true" className="ph-mono ph-ag-end">
                {event.end}
              </span>
            ) : null}
          </>
        ) : (
          <span aria-hidden="true" className="ph-ag-allday">
            {tCard("allDay")}
          </span>
        )}
        <span aria-hidden="true" className="ph-ag-line" />
      </div>
      <div className="ph-ag-card">
        <div className="ph-ag-card-head">
          <span data-slot="agenda-stage" className="ph-pill ph-pri">
            <span aria-hidden="true" className="ph-ag-pill-dot" />
            <span className="truncate">{event.stage}</span>
          </span>
          <span data-slot="agenda-when" className="ph-mono ph-ag-when">
            {when}
          </span>
        </div>
        <h3 id={roleId} className="ph-ag-h3">
          {event.role}
        </h3>
        <p className="ph-ag-sub">
          {duration
            ? t("companyDuration", { company: event.company, duration })
            : event.company}
        </p>
        {notes ? <p className="ph-ag-notes">{notes}</p> : null}
        <div className="ph-ag-actions">
          {event.alert ? (
            <button
              type="button"
              aria-pressed={event.alert.enabled}
              aria-label={t("alerts", names)}
              data-action="alert"
              className="ph-ag-icon"
              onClick={event.alert.onToggle}
            >
              <PhoneBell size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={tNames("addToCalendar", names)}
            data-action="calendar"
            className="ph-ag-icon"
            onClick={() => onAddToCalendar(event.id)}
          >
            <PhoneCalendarPlus size={16} aria-hidden="true" />
          </button>
          <Link
            href={focusHref(event.applicationId)}
            aria-label={tNames("open", names)}
            data-action="open"
            className="ph-ag-open"
          >
            {tToday("open")}
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function LaterRow({
  item,
  shownMonth,
}: {
  item: AgendaLaterItem;
  /** The month the header shows: a row in another one names its month, not its weekday. */
  shownMonth: Date | undefined;
}) {
  const format = useFormatter();
  const locale = useLocale();
  const titleId = useId();
  const companyId = useId();
  const whenId = useId();

  const otherMonth =
    shownMonth !== undefined &&
    (item.date.getMonth() !== shownMonth.getMonth() ||
      item.date.getFullYear() !== shownMonth.getFullYear());
  const label = format
    .dateTime(item.date, otherMonth ? { month: "short" } : { weekday: "short" })
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
        data-slot="agenda-later-item"
        data-application-id={item.applicationId}
        className="ph-up-row"
      >
        <span aria-hidden="true" className="ph-up-date">
          <span className="ph-up-dow">{label}</span>
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

/** "Later" lists this many after the chosen day (v2/Schedule). */
export const AGENDA_LATER_COUNT = 5;

/** How far past the shown week the request reaches, so "Later" has its five. */
export const AGENDA_LATER_WINDOW_DAYS = 60;

/** The seven days of `monday`'s week, Monday first. */
export function agendaWeek(
  monday: Date,
  today: string,
  items: readonly AgendaStep[] | undefined,
  localTz?: string,
): AgendaWeekDay[] {
  const days = new Set(items?.map((step) => agendaDay(step, localTz)));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const key = dayKey(date);
    return { key, date, today: key === today, hasEvents: days.has(key) };
  });
}

/** Minutes from the start to the end, for "30 min", "1 h" (none without both or when it is not after). */
function durationOf(step: AgendaStep, localTz: string): number | undefined {
  if (!step.start_time || !step.end_time) return undefined;
  const start = agendaStartInstant(step, localTz).getTime();
  const end = agendaStartInstant(
    { ...step, start_time: step.end_time },
    localTz,
  ).getTime();
  const minutes = Math.round((end - start) / 60_000);
  return minutes > 0 ? minutes : undefined;
}

/**
 * v2/Schedule, wired: a week strip (Monday first) the arrows move by
 * a week, keeping the weekday or landing on today when the new week holds
 * it; `useAgenda` asked for the shown week and the 60 days after it; the
 * chosen day's cards (time, stage, time to start, notes, the sound-alert bell
 * on a timed upcoming card only, the calendar file, Open); "Later", the next
 * five after the chosen day. Days are the viewer's (`agendaDay`).
 */
export function AgendaScreen() {
  const t = useTranslations();
  const { user } = useAuth();
  const now = useMinuteClock();
  const localTz = getUserTimezone();
  const today = dayKey(now);
  const { isEnabled, toggle } = useAgendaNotifications();
  const [selectedKey, setSelectedKey] = useState(today);

  const monday = mondayOf(parseDayKey(selectedKey));
  const query = useAgenda({
    from_date: dayKey(addDays(monday, -1)),
    to_date: dayKey(addDays(monday, 7 + AGENDA_LATER_WINDOW_DAYS)),
  });
  const items = query.data;
  const byStart = (a: AgendaStep, b: AgendaStep) =>
    agendaStartInstant(a, localTz).getTime() -
    agendaStartInstant(b, localTz).getTime();

  const moveWeek = (weeks: number) => {
    const target = addDays(parseDayKey(selectedKey), weeks * 7);
    const targetMonday = mondayOf(target);
    const todayDate = parseDayKey(today);
    const holdsToday =
      todayDate >= targetMonday && todayDate < addDays(targetMonday, 7);
    setSelectedKey(holdsToday ? today : dayKey(target));
  };

  const load = fromQuery(query);
  const day = mapLoad(load, (list): AgendaEvent[] =>
    list
      .filter((step) => agendaDay(step, localTz) === selectedKey)
      .sort(byStart)
      .map((step) => {
        const display = getDisplayTime(step, localTz);
        const past = isStepPast(step, now, localTz);
        return {
          id: step.id,
          applicationId: step.application_id,
          stage: t(stagePillKey(step.event_type, step.interview_type)),
          role: step.role,
          company: step.company_name,
          time: display?.time,
          end: display?.endTime,
          durationMinutes: durationOf(step, localTz),
          when: past
            ? { kind: "done" as const }
            : agendaTimeToStart(step, now, localTz),
          notes: step.observation,
          alert:
            step.start_time && !past
              ? {
                  enabled: isEnabled(step.id),
                  onToggle: () => toggle(step.id),
                }
              : undefined,
        };
      }),
  );
  const later = mapLoad(load, (list): AgendaLaterItem[] =>
    list
      .filter((step) => agendaDay(step, localTz) > selectedKey)
      .sort(byStart)
      .slice(0, AGENDA_LATER_COUNT)
      .map((step) => ({
        id: step.id,
        applicationId: step.application_id,
        title: t(
          `phone.stageTitle.${stageTitleKey(step.event_type, step.interview_type)}`,
        ),
        company: step.company_name,
        date: parseDayKey(agendaDay(step, localTz)),
        time: getDisplayTime(step, localTz)?.time,
      })),
  );

  return (
    <OpensOnCurrentCycle>
      <AgendaScreenView
        initials={user ? initialsOf(user) : ""}
        week={agendaWeek(monday, today, items, localTz)}
        selectedKey={selectedKey}
        onSelectDay={setSelectedKey}
        onPreviousWeek={() => moveWeek(-1)}
        onNextWeek={() => moveWeek(1)}
        day={day}
        later={later}
        onAddToCalendar={(eventId) => {
          const step = items?.find((item) => item.id === eventId);
          if (!step) return;
          genAgendaStepIcsFile(step);
          toast.success(t("agenda.downloaded"));
        }}
      />
    </OpensOnCurrentCycle>
  );
}
