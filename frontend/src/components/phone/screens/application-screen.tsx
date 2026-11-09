"use client";

import { useId, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  Ellipsis,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { getDisplayTime } from "@/components/agenda/agenda-view";
import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { formatSalary } from "@/components/applications/application-format";
import { PhoneChromeless } from "@/components/layout/phone-shell";
import { PhoneGroup, PhoneGroupRow } from "@/components/phone/phone-group";
import {
  PhoneCalendarPlus,
  PhoneFileText,
} from "@/components/phone/phone-icons";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import { PhoneSheet, PhoneSheetClose } from "@/components/phone/phone-sheet";
import { PhoneTimelineDialog } from "@/components/phone/phone-timeline-dialog";
import { useCycleContext } from "@/contexts/cycle-context";
import {
  useApplicationDelete,
  useApplications,
} from "@/hooks/use-applications";
import { useHasFeature } from "@/hooks/use-features";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { usePlatforms } from "@/hooks/use-platforms";
import { useReopenApplication } from "@/hooks/use-reopen-application";
import { useTimeline } from "@/hooks/use-timeline";
import { getApiError } from "@/lib/api-client";
import { applicationHistory } from "@/lib/application-history";
import { genAgendaStepIcsFile } from "@/lib/calendar";
import {
  companyInitials,
  parseDayKey,
  stageTitleKey,
} from "@/lib/phone-format";
import { pipelineOutcome, reachedStage } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { Application } from "@/services/types/applications";
import type { TimelineEvent } from "@/services/types/timeline";

/** The board's four progress steps, in its order (v2/Application). Closed is not a step. */
export const APPLICATION_PROGRESS = [
  "applied",
  "screening",
  "technical",
  "offer",
] as const;

export type ApplicationProgressStage = (typeof APPLICATION_PROGRESS)[number];

/** The board's detail rows, in its order (v2/Application). */
export const APPLICATION_DETAIL_KEYS = [
  "source",
  "workMode",
  "country",
  "experience",
  "salaryRange",
  "expected",
] as const;

export type ApplicationDetailKey = (typeof APPLICATION_DETAIL_KEYS)[number];

/** The board sets these two in mono. */
const MONO_DETAILS: ReadonlySet<ApplicationDetailKey> = new Set([
  "salaryRange",
  "expected",
]);

export interface ApplicationDetail {
  key: ApplicationDetailKey;
  /** Already in words ("Remote", "€60k – €75k"); a blank one is left out. */
  value: string;
}

export interface ApplicationScreenData {
  applicationId: string;
  company: string;
  role: string;
  /** `application_date` at local midnight (never `new Date("YYYY-MM-DD")`). */
  appliedOn: Date;
  /** The platform's name; absent reads "Applied Oct 18". */
  platform?: string;
  /** The furthest stage the application reached: `aria-current="step"`. */
  reached: ApplicationProgressStage;
  /** `finalized_at` is set: Reopen only, no update. */
  closed: boolean;
  /** The outcome event: "denied" also marks an open application. */
  outcome: "denied" | "offer" | null;
  /** Any order; the view keeps the board's and drops blank values. */
  details: readonly ApplicationDetail[];
  jobUrl?: string;
  notes?: string;
}

export interface ApplicationNextStep {
  eventId: string;
  /** The stage's words, e.g. "Technical interview". */
  title: string;
  /** The step's local day, at local midnight. */
  date: Date;
  /** Calendar days from today to `date`: 0 "today", 1 "tomorrow", else "in N days". */
  daysAway: number;
  /** Local and formatted ("14:00 – 15:00"); absent for an all-day step. */
  timeRange?: string;
}

/** PRD 0021: a future event, a past interview followed by a later event, any other past event. */
export type ApplicationHistoryStatus = "scheduled" | "passed" | "done";

export interface ApplicationHistoryItem {
  eventId: string;
  /** The stage's words, e.g. "Initial screening", "Denied". */
  title: string;
  /** The event's local day, at local midnight. */
  date: Date;
  status: ApplicationHistoryStatus;
}

export interface ApplicationTimeline {
  /** The first scheduled step from now on; `null` shows no card. */
  next: ApplicationNextStep | null;
  /** Newest first; the view adds "Applied" at the end. */
  history: readonly ApplicationHistoryItem[];
}

export interface ApplicationScreenViewProps {
  /** The clock dates are read against (a year shows only when it is not this one). */
  now: Date;
  /** `null` once ready: the id is not in the cycle being viewed. */
  application: PhoneLoad<ApplicationScreenData | null>;
  timeline: PhoneLoad<ApplicationTimeline>;
  /** An archived cycle: nothing to write (no bar, no Edit, no Delete). */
  archived: boolean;
  /** "Pipeline": the list on this same route (`replaceState`), never a navigation. */
  onBack: () => void;
  /** Opens today's `ApplicationFormSheet`. */
  onEdit: () => void;
  /** With `cvs` only: the application's CV copy. */
  cvHref?: string;
  /** The confirm sheet's Delete. */
  onDelete: () => void;
  deletePending?: boolean;
  /** Opens today's `TimelineEventDialog` in close mode. */
  onCloseApplication: () => void;
  /** Opens today's `TimelineEventDialog` in add mode. */
  onLogUpdate: () => void;
  onReopen: () => void;
  reopenPending?: boolean;
  onAddToCalendar: (next: ApplicationNextStep) => void;
}

/** v2/Application below md: props in, the board out. The shell draws no tab bar or FAB under it. */
export function ApplicationScreenView({
  now,
  application,
  timeline,
  archived,
  onBack,
  onEdit,
  cvHref,
  onDelete,
  deletePending = false,
  onCloseApplication,
  onLogUpdate,
  onReopen,
  reopenPending = false,
  onAddToCalendar,
}: ApplicationScreenViewProps) {
  const t = useTranslations("phone.application");
  const tShell = useTranslations("phone.shell");
  const tPage = useTranslations("applications.page");
  const tActions = useTranslations("applications.actions");
  const tClose = useTranslations("applications.close");
  const tDelete = useTranslations("applications.deleteDialog");
  const tToday = useTranslations("phone.today.attention");
  const titleId = useId();
  const moreButton = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const data = application.status === "ready" ? application.data : null;
  const writable = data !== null && !archived;
  const canEdit = data !== null && !archived && !data.closed;
  const hasMore = writable || (data !== null && cvHref !== undefined);

  return (
    <div
      data-slot="phone-application"
      data-application-id={data?.applicationId}
      data-closed={data?.closed || undefined}
      data-archived={archived || undefined}
      className="ph-app"
    >
      <header data-slot="application-top-bar" className="ph-top ph-ap-head">
        <Link
          href="/applications"
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            // A plain tap restores the list in place; a new tab or window follows the href.
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            onBack();
          }}
          data-action="back"
          className="ph-back"
        >
          <ChevronLeft size={24} aria-hidden="true" />
          {tShell("pipeline")}
        </Link>
        {hasMore ? (
          <button
            ref={moreButton}
            type="button"
            aria-label={t("more")}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-action="more"
            className="ph-ap-more"
            onClick={() => setMoreOpen(true)}
          >
            <Ellipsis size={22} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <PhoneLoadable
        state={application}
        className={cn("ph-ap-main", !writable && "ph-ap-readonly")}
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="size-14 rounded-[18px]" />
            <PhoneSkeletonCard className="mt-2 h-8 w-3/4 rounded-lg" />
            <PhoneSkeletonCard className="h-5 w-1/2 rounded-lg" />
            <PhoneSkeletonCard className="mt-6 h-[34px] rounded-lg" />
            <PhoneSkeletonCard className="mt-6 h-[152px]" />
          </PhoneSkeleton>
        }
      >
        {(found) =>
          found ? (
            <ApplicationBody
              data={found}
              now={now}
              archived={archived}
              timeline={timeline}
              titleId={titleId}
              onAddToCalendar={onAddToCalendar}
            />
          ) : (
            <p
              data-slot="application-not-found"
              className="ph-card text-[15px] text-foreground"
            >
              {tPage("focusNotInCycle")}
            </p>
          )
        }
      </PhoneLoadable>

      {data && !archived ? (
        <div data-slot="application-actions" className="ph-ap-bar">
          {data.closed ? (
            // aria-disabled, never disabled: a disabled button drops focus to <body>.
            <button
              type="button"
              aria-disabled={reopenPending || undefined}
              aria-busy={reopenPending || undefined}
              aria-describedby={titleId}
              data-action="reopen"
              className="ph-ap-log"
              onClick={() => {
                if (!reopenPending) onReopen();
              }}
            >
              {reopenPending ? (
                <Loader2 size={18} aria-hidden="true" className="ph-spin" />
              ) : (
                <RotateCcw size={18} aria-hidden="true" />
              )}
              {tClose("reopenAction")}
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-haspopup="dialog"
                data-action="close-application"
                className="ph-ap-close"
                onClick={onCloseApplication}
              >
                {tClose("closeAction")}
              </button>
              <button
                type="button"
                aria-haspopup="dialog"
                data-action="log-update"
                className="ph-ap-log"
                onClick={onLogUpdate}
              >
                <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                {tToday("logUpdate")}
              </button>
            </>
          )}
        </div>
      ) : null}

      {data ? (
        <PhoneSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          title={data.company}
          description={data.role}
          showClose
          titleClassName="min-w-0 truncate"
        >
          <PhoneGroup data-slot="application-more-actions" className="mt-4">
            {canEdit ? (
              <PhoneGroupRow
                rowKey="edit"
                icon={Pencil}
                label={tActions("edit")}
                popup="dialog"
                onClick={() => {
                  setMoreOpen(false);
                  onEdit();
                }}
              />
            ) : null}
            {cvHref ? (
              <PhoneGroupRow
                rowKey="cv"
                icon={PhoneFileText}
                label={tActions("cv")}
                href={cvHref}
              />
            ) : null}
            {writable ? (
              <PhoneGroupRow
                rowKey="delete"
                icon={Trash2}
                label={tActions("delete")}
                popup="dialog"
                className="ph-ap-danger"
                onClick={() => {
                  setMoreOpen(false);
                  setConfirmOpen(true);
                }}
              />
            ) : null}
          </PhoneGroup>
        </PhoneSheet>
      ) : null}

      <PhoneSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        alert
        title={tDelete("title")}
        description={tDelete("body")}
        fallbackFocus={moreButton}
      >
        {/* Cancel first: the confirm opens on the safe choice. */}
        <div
          data-slot="application-delete-confirm"
          className="mt-6 flex gap-2.5"
        >
          <PhoneSheetClose asChild>
            <button
              type="button"
              data-action="cancel-delete"
              className="ph-btn ph-sec flex-1"
            >
              {tDelete("cancel")}
            </button>
          </PhoneSheetClose>
          <button
            type="button"
            aria-disabled={deletePending || undefined}
            aria-busy={deletePending || undefined}
            data-action="confirm-delete"
            className="ph-btn ph-dan flex-1"
            onClick={() => {
              if (!deletePending) onDelete();
            }}
          >
            {deletePending ? (
              <Loader2 size={18} aria-hidden="true" className="ph-spin" />
            ) : null}
            {tDelete("confirm")}
          </button>
        </div>
      </PhoneSheet>
    </div>
  );
}

function ApplicationBody({
  data,
  now,
  archived,
  timeline,
  titleId,
  onAddToCalendar,
}: {
  data: ApplicationScreenData;
  now: Date;
  archived: boolean;
  timeline: PhoneLoad<ApplicationTimeline>;
  titleId: string;
  onAddToCalendar: (next: ApplicationNextStep) => void;
}) {
  const t = useTranslations("phone.application");
  const tStage = useTranslations("phone.pipeline.stage");
  const tPage = useTranslations("applications.page");
  const tDetail = useTranslations("applications.detail");
  const tEvent = useTranslations("timeline.eventType");
  const tTimeline = useTranslations("agenda.timeline");
  const day = useDay(now);
  const detailsId = useId();
  const historyId = useId();
  const notesId = useId();

  const reachedIndex = APPLICATION_PROGRESS.indexOf(data.reached);
  const details = APPLICATION_DETAIL_KEYS.flatMap((key) => {
    const row = data.details.find((detail) => detail.key === key);
    return row && row.value.trim() !== "" ? [row] : [];
  });
  const notes = data.notes?.trim();
  const next =
    timeline.status === "ready" && !data.closed ? timeline.data.next : null;
  const status = data.closed
    ? t("closed", { outcome: data.outcome ?? "none" })
    : data.outcome === "denied"
      ? tEvent("denied")
      : null;

  return (
    <>
      <div data-slot="application-head">
        <div className="ph-ap-tile-row">
          <span aria-hidden="true" className="ph-ap-tile">
            {companyInitials(data.company)}
          </span>
          {status ? (
            <PhonePill
              dot={
                data.outcome === "denied"
                  ? "var(--destructive)"
                  : data.outcome === "offer"
                    ? "var(--success)"
                    : "var(--muted-foreground)"
              }
            >
              {status}
            </PhonePill>
          ) : null}
        </div>
        <h1 id={titleId} className="ph-ap-h1">
          {data.company}
        </h1>
        <p className="ph-ap-role">{data.role}</p>
        <p className="ph-ap-meta">
          {data.platform
            ? t("applied", {
                date: day(data.appliedOn),
                platform: data.platform,
              })
            : t("appliedOn", { date: day(data.appliedOn) })}
        </p>
        {archived ? (
          <p data-slot="application-archived" className="ph-ap-meta">
            {tPage("archivedSubtitle")}
          </p>
        ) : null}
      </div>

      <section aria-label={t("progress")} data-slot="application-progress">
        <ol className="ph-ap-steps">
          {APPLICATION_PROGRESS.map((stage, index) => (
            <li
              key={stage}
              data-stage={stage}
              data-reached={index <= reachedIndex || undefined}
              aria-current={stage === data.reached ? "step" : undefined}
              className="ph-ap-step"
            >
              <span aria-hidden="true" className="ph-ap-step-bar" />
              <span className="ph-ap-step-label">{tStage(stage)}</span>
            </li>
          ))}
        </ol>
      </section>

      {next ? (
        <NextStepCard next={next} onAddToCalendar={onAddToCalendar} />
      ) : null}

      {details.length > 0 || data.jobUrl ? (
        <section aria-labelledby={detailsId} data-slot="application-details">
          <h2 id={detailsId} className="ph-gh">
            {t("details")}
          </h2>
          {details.length > 0 ? (
            <dl className="ph-kv-list">
              {details.map((row) => (
                <div key={row.key} data-detail={row.key} className="ph-kv">
                  <dt>{t(`detail.${row.key}`)}</dt>
                  <dd className={cn(MONO_DETAILS.has(row.key) && "ph-mono")}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {data.jobUrl ? (
            <a
              href={data.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-slot="application-job-link"
              className="ph-ap-link"
            >
              {tDetail("jobPostingLink")}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby={historyId} data-slot="application-history">
        <h2 id={historyId} className="ph-ap-history-h">
          {t("history")}
        </h2>
        <PhoneLoadable
          state={timeline}
          loading={
            <PhoneSkeleton label={tTimeline("loading")}>
              <PhoneSkeletonCard className="h-[150px]" />
            </PhoneSkeleton>
          }
        >
          {({ history }) => (
            <ol className="ph-ap-history">
              {history.map((item) => (
                <HistoryRow
                  key={item.eventId}
                  title={item.title}
                  when={t("historyWhen", {
                    date: day(item.date),
                    status: item.status,
                  })}
                  status={item.status}
                />
              ))}
              <HistoryRow
                title={tStage("applied")}
                when={day(data.appliedOn)}
                status="applied"
                last
              />
            </ol>
          )}
        </PhoneLoadable>
      </section>

      {notes ? (
        <section aria-labelledby={notesId} data-slot="application-notes">
          <h2 id={notesId} className="ph-gh">
            {tDetail("notes")}
          </h2>
          <p className="ph-ap-notes">{notes}</p>
        </section>
      ) : null}
    </>
  );
}

function NextStepCard({
  next,
  onAddToCalendar,
}: {
  next: ApplicationNextStep;
  onAddToCalendar: (next: ApplicationNextStep) => void;
}) {
  const t = useTranslations("phone.application");
  const tToday = useTranslations("phone.today");
  const format = useFormatter();
  const headingId = useId();

  const date = format.dateTime(next.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <section
      aria-labelledby={headingId}
      data-slot="application-next-step"
      data-event-id={next.eventId}
      className="ph-ap-next"
    >
      <p className="ph-ap-next-eyebrow">
        {t("nextStep", { days: Math.max(0, next.daysAway) })}
      </p>
      <h2 id={headingId} className="ph-ap-next-title">
        {next.title}
      </h2>
      <p className="ph-mono ph-ap-next-when">
        {next.timeRange
          ? // The line breaks before the range, never inside it.
            t("nextWhen", { date, time: next.timeRange.replace(/ /g, " ") })
          : date}
      </p>
      <button
        type="button"
        aria-describedby={headingId}
        data-action="add-to-calendar"
        className="ph-ap-cal"
        onClick={() => onAddToCalendar(next)}
      >
        <PhoneCalendarPlus size={16} aria-hidden="true" />
        {tToday("addToCalendar")}
      </button>
    </section>
  );
}

function HistoryRow({
  title,
  when,
  status,
  last = false,
}: {
  title: string;
  when: string;
  status: ApplicationHistoryStatus | "applied";
  last?: boolean;
}) {
  return (
    <li data-status={status} className="ph-ap-ev">
      <span aria-hidden="true" className="ph-ap-ev-rail">
        <span data-status={status} className="ph-ap-ev-dot" />
        {last ? null : <span className="ph-ap-ev-line" />}
      </span>
      <div className="ph-ap-ev-body">
        <div className="ph-ap-ev-title">{title}</div>
        <div className="ph-mono ph-ap-ev-when">{when}</div>
      </div>
    </li>
  );
}

/** "Oct 18"; "Oct 18, 2025" when it is not this year. */
function useDay(now: Date) {
  const format = useFormatter();
  return (date: Date) =>
    format.dateTime(date, {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() === now.getFullYear()
        ? {}
        : { year: "numeric" as const }),
    });
}

export interface ApplicationScreenProps {
  applicationId: string;
  /** Back to the Pipeline list, on this same route. */
  onBack: () => void;
}

/** The event as an agenda item, for the calendar file and `getDisplayTime`. */
function asAgendaStep(event: TimelineEvent, app: Application) {
  return {
    id: event.id,
    step_date: event.event_date,
    event_type: event.event_type,
    interview_type: event.interview_type,
    start_time: event.start_time ?? undefined,
    end_time: event.end_time ?? undefined,
    timezone: event.timezone ?? undefined,
    observation: event.observation ?? undefined,
    application_id: app.id,
    company_name: app.company_name,
    role: app.role,
  };
}

/**
 * v2/Application, wired, for `/applications?focus=<id>` below md: the
 * application out of the viewed cycle's list (`useApplications`, the same
 * cache as the Pipeline), its timeline (`useTimeline`), Edit through today's
 * `ApplicationFormSheet`, Delete behind the confirm sheet, Close and Log
 * update through today's timeline event dialog, Reopen when closed. An
 * archived cycle is read-only. The shell draws no tab bar or FAB
 * while it shows (`PhoneChromeless`).
 */
export function ApplicationScreen({
  applicationId,
  onBack,
}: ApplicationScreenProps) {
  const t = useTranslations();
  const now = useMinuteClock();
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();
  const apps = useApplications(selectedCycleId);
  const timelineQuery = useTimeline(applicationId);
  const platforms = usePlatforms();
  const { has: hasCvs } = useHasFeature("cvs");
  const { deleteApplication, isPending: deletePending } =
    useApplicationDelete();
  const reopen = useReopenApplication();
  const [dialog, setDialog] = useState<"event" | "close" | null>(null);
  const [editing, setEditing] = useState(false);

  const app =
    apps.applications === undefined
      ? undefined
      : (apps.applications.find((item) => item.id === applicationId) ?? null);
  const events = timelineQuery.data;
  const story = events && app ? applicationHistory(events, now) : null;

  // A deleted row leaves the list a moment before Back runs: still loading, not "not in this cycle".
  const leaving = deletePending && app === null;
  const application = mapLoad(
    fromQuery({
      data: leaving ? undefined : app,
      isError: apps.isError,
      error: apps.error,
      isFetching: apps.isFetching,
      refetch: apps.refetch,
    }),
    (found): ApplicationScreenData | null =>
      found ? screenData(found, events, t, platforms.data) : null,
  );

  const timeline = mapLoad(
    fromQuery(timelineQuery),
    (): ApplicationTimeline => ({
      next:
        story?.next && app
          ? {
              eventId: story.next.event.id,
              title: t(
                `phone.stageTitle.${stageTitleKey(story.next.event.event_type, story.next.event.interview_type)}`,
              ),
              date: parseDayKey(story.next.day),
              daysAway: story.next.daysAway,
              timeRange: timeRange(asAgendaStep(story.next.event, app)),
            }
          : null,
      history: (story?.history ?? []).map((entry) => ({
        eventId: entry.event.id,
        title: t(
          `phone.stageTitle.${stageTitleKey(entry.event.event_type, entry.event.interview_type)}`,
        ),
        date: parseDayKey(entry.day),
        status: entry.status,
      })),
    }),
  );

  return (
    <>
      <PhoneChromeless />
      <ApplicationScreenView
        now={now}
        application={application}
        timeline={timeline}
        archived={isViewingPastCycle}
        onBack={onBack}
        onEdit={() => setEditing(true)}
        cvHref={
          hasCvs
            ? `/applications/cv?id=${encodeURIComponent(applicationId)}`
            : undefined
        }
        onDelete={() =>
          void deleteApplication(applicationId, { onSuccess: onBack })
        }
        deletePending={deletePending}
        onCloseApplication={() => setDialog("close")}
        onLogUpdate={() => setDialog("event")}
        onReopen={() =>
          reopen.mutate(applicationId, {
            onSuccess: () =>
              toast.success(t("applications.pageToasts.reopened")),
            onError: (error) =>
              toast.error(
                isAxiosError(error)
                  ? getApiError(error)
                  : t("applications.pageToasts.reopenFailed"),
              ),
          })
        }
        reopenPending={reopen.isPending}
        onAddToCalendar={(next) => {
          const event = events?.find((item) => item.id === next.eventId);
          if (!event || !app) return;
          genAgendaStepIcsFile(asAgendaStep(event, app));
          toast.success(t("agenda.downloaded"));
        }}
      />
      {dialog && app ? (
        <PhoneTimelineDialog
          key={dialog}
          applicationId={app.id}
          purpose={dialog}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          opener={() =>
            document.querySelector<HTMLElement>(
              `[data-slot="phone-application"] [data-action="${dialog === "close" ? "close-application" : "log-update"}"]`,
            )
          }
          // A closed application's bar swaps Close for Reopen.
          fallbackFocus={applicationFocusFallback}
        />
      ) : null}
      {editing && app ? (
        <ApplicationFormSheet
          open
          application={app}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          onCloseAutoFocus={(event) => {
            // The More sheet's Edit row that opened it is gone: back to More.
            event.preventDefault();
            document
              .querySelector<HTMLElement>(
                '[data-slot="phone-application"] [data-action="more"]',
              )
              ?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** The Application screen's next best focus: its bar's first action, else its back link. */
function applicationFocusFallback(): HTMLElement | null {
  const screen = document.querySelector('[data-slot="phone-application"]');
  for (const action of ["reopen", "log-update", "back"]) {
    const element = screen?.querySelector<HTMLElement>(
      `[data-action="${action}"]`,
    );
    if (element) return element;
  }
  return null;
}

function timeRange(step: Parameters<typeof getDisplayTime>[0]) {
  const display = getDisplayTime(step);
  if (!display) return undefined;
  return display.endTime
    ? `${display.time} – ${display.endTime}`
    : display.time;
}

type Translate = ReturnType<typeof useTranslations>;

/** The application in the board's words: the details that are filled in, the stage, the outcome. */
function screenData(
  app: Application,
  events: readonly TimelineEvent[] | undefined,
  t: Translate,
  platformList: readonly { id: string; name: string }[] | undefined,
): ApplicationScreenData {
  const salary = (parts: Parameters<typeof formatSalary>[0]) =>
    formatSalary(parts) ?? "";
  const details: ApplicationDetail[] = [
    {
      key: "source",
      value:
        app.mode === "active"
          ? t("applications.item.modeActive")
          : t("applications.item.modePassive"),
    },
    {
      key: "workMode",
      value: app.work_mode ? t(`options.workMode.${app.work_mode}`) : "",
    },
    { key: "country", value: app.country ?? "" },
    {
      key: "experience",
      value: app.experience_level
        ? t(`options.seniority.${app.experience_level}`)
        : "",
    },
    {
      key: "salaryRange",
      value:
        app.salary_range_min != null || app.salary_range_max != null
          ? salary({
              salaryRangeMin: app.salary_range_min?.toString(),
              salaryRangeMax: app.salary_range_max?.toString(),
              currency: app.currency,
              salaryPeriod: app.salary_period,
            })
          : "",
    },
    {
      key: "expected",
      value:
        app.expected_salary != null
          ? salary({
              expectedSalary: app.expected_salary.toString(),
              currency: app.currency,
              salaryPeriod: app.salary_period,
            })
          : "",
    },
  ];
  return {
    applicationId: app.id,
    company: app.company_name,
    role: app.role,
    appliedOn: parseDayKey(app.application_date),
    platform: platformList?.find((platform) => platform.id === app.platform_id)
      ?.name,
    reached: reachedStage(app, events),
    closed: app.finalized_at != null,
    outcome: pipelineOutcome(app),
    details,
    jobUrl: app.link_to_job || undefined,
    notes: app.observation || undefined,
  };
}
