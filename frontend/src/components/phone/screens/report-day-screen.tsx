"use client";

import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneActionBar } from "@/components/phone/phone-action-bar";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { fromQuery } from "@/components/phone/phone-query-load";
import { PhoneStat, PhoneStatGrid } from "@/components/phone/phone-stat-grid";
import {
  REPORT_TOTAL_DAYS,
  ReportStatusPill,
} from "@/components/phone/screens/reports-screen";
import { useCycleContext } from "@/contexts/cycle-context";
import { useReportForm } from "@/hooks/use-report-form";
import {
  useReportDetail,
  useReportSubmit,
  useReports,
} from "@/hooks/use-repports";
import { effectiveReportStatus } from "@/lib/reports";
import {
  ReportDays,
  type ReportDaysType,
  type ReportDetailResponse,
} from "@/services/types/reports";
import {
  CHALLENGE_MAX,
  GOAL_MAX,
  WIN_MAX,
} from "@/components/reports/report-form-config";
import { formatReportDay } from "@/components/reports/report-view";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFormatNumber } from "@/i18n/format-number";
import { useIntlLocale } from "@/i18n/intl-locale";
import { cn } from "@/lib/utils";

export interface ReportDayMetrics {
  applications: number;
  interviewsDone: number;
  offers: number;
  activeProcesses: number;
  totalApplications: number;
  totalScreenings: number;
  /** A fraction (0.41 is 41%), as the API sends it. */
  callbackRate: number;
  offerRate: number;
}

export type ReportDayField =
  | "startDate"
  | "mockInterviews"
  | "linkedinPosts"
  | "strategicConnections"
  | "biggestWin"
  | "biggestChallenge"
  | "nextGoal";

export interface ReportDayEdit {
  mode: "edit";
  /** `form.handleSubmit(submit)`. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  /** The bar's Cancel: back to the list. */
  cancelHref: string;
  /** `yyyy-MM-dd`. Only day 1 picks it (`DatePickerInput`); later days show it read-only. */
  startDate: {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    editable: boolean;
  };
  /** `form.register(...)` for each number and text field (numbers `valueAsNumber`). */
  fields: {
    mockInterviews: ComponentProps<"input">;
    linkedinPosts: ComponentProps<"input">;
    strategicConnections: ComponentProps<"input">;
    biggestWin: ComponentProps<"textarea">;
    biggestChallenge: ComponentProps<"textarea">;
    nextGoal: ComponentProps<"textarea">;
  };
  /** `useWatch` lengths, for the counters. */
  lengths: { biggestWin: number; biggestChallenge: number; nextGoal: number };
  /** zod's words per field. */
  errors: Partial<Record<ReportDayField, string>>;
}

export interface ReportDayRead {
  mode: "read";
  /** `period.start_date`, `yyyy-MM-dd`. */
  startDate: string;
  /** `manual_metrics`; `null` reads as a dash. */
  manual: {
    mockInterviews: number | null;
    linkedinPosts: number | null;
    strategicConnections: number | null;
    biggestWin: string | null;
    biggestChallenge: string | null;
    nextGoal: string | null;
  };
}

export type ReportDayScreenViewProps = {
  day: number;
  /** The last report day (120). */
  totalDays: number;
  phase: number;
  /** The bar's pill: what the list says about this report. */
  status: "pending" | "overdue" | "submitted";
  metrics: ReportDayMetrics;
} & (ReportDayEdit | ReportDayRead);

/** v2/ReportDay below md: the form with the bar, or the submitted report read-only. */
export function ReportDayScreenView(props: ReportDayScreenViewProps) {
  const { day, totalDays, phase, status, metrics } = props;
  const t = useTranslations("reports.detail");
  const formatNumber = useFormatNumber();
  const intlLocale = useIntlLocale();
  const autoId = useId();
  const manualId = useId();
  const reflectionId = useId();
  const totalsId = useId();
  const goalId = useId();
  const edit = props.mode === "edit" ? props : null;
  const read = props.mode === "read" ? props : null;
  const dash = "—";
  const rate = (value: number) => `${formatNumber(value * 100, 1)}%`;

  const body = (
    <>
      <div>
        <h1 className="ph-h1 ph-rd-h1">
          {t("heading", { day, total: totalDays })}
        </h1>
        <p className="ph-lead">{t("phase", { phase })}</p>
      </div>

      <section aria-labelledby={autoId}>
        <h2 id={autoId} className="ph-h2">
          {t("autoTitle")}
        </h2>
        <p className="ph-hint ph-rd-auto-hint">{t("autoDescription")}</p>
        <PhoneStatGrid>
          <PhoneStat term={t("applications")} mono valueClassName="ph-dd-num">
            {formatNumber(metrics.applications)}
          </PhoneStat>
          <PhoneStat term={t("interviewsDone")} mono valueClassName="ph-dd-num">
            {formatNumber(metrics.interviewsDone)}
          </PhoneStat>
          <PhoneStat
            term={t("offers")}
            mono
            valueClassName="ph-dd-num ph-rd-offers"
          >
            {formatNumber(metrics.offers)}
          </PhoneStat>
          <PhoneStat
            term={t("activeProcesses")}
            mono
            valueClassName="ph-dd-num"
          >
            {formatNumber(metrics.activeProcesses)}
          </PhoneStat>
        </PhoneStatGrid>
      </section>

      <section aria-labelledby={manualId} className="ph-rd-section">
        <h2 id={manualId} className="ph-h2">
          {t("manualTitle")}
        </h2>
        {edit && edit.startDate.editable ? (
          <DateField
            label={t("startDate")}
            value={edit.startDate.value}
            onChange={edit.startDate.onChange}
            error={edit.errors.startDate}
          />
        ) : (
          <ReadField
            label={t("startDate")}
            value={formatReportDay(
              edit ? edit.startDate.value : read?.startDate,
              intlLocale,
            )}
          />
        )}
        <div className="ph-rd-grid3">
          {edit ? (
            <>
              <NumberField
                label={t("mockInterviews")}
                input={edit.fields.mockInterviews}
                error={edit.errors.mockInterviews}
              />
              <NumberField
                label={t("linkedinPosts")}
                input={edit.fields.linkedinPosts}
                error={edit.errors.linkedinPosts}
              />
              <NumberField
                label={t("strategicConnections")}
                input={edit.fields.strategicConnections}
                error={edit.errors.strategicConnections}
              />
            </>
          ) : (
            <>
              <ReadField
                label={t("mockInterviews")}
                mono
                value={read?.manual.mockInterviews ?? dash}
              />
              <ReadField
                label={t("linkedinPosts")}
                mono
                value={read?.manual.linkedinPosts ?? dash}
              />
              <ReadField
                label={t("strategicConnections")}
                mono
                value={read?.manual.strategicConnections ?? dash}
              />
            </>
          )}
        </div>
      </section>

      <section aria-labelledby={reflectionId} className="ph-rd-section">
        <h2 id={reflectionId} className="ph-h2">
          {t("reflection")}
        </h2>
        {edit ? (
          <>
            <TextField
              label={t("biggestWin")}
              placeholder={t("biggestWinPlaceholder")}
              textarea={edit.fields.biggestWin}
              length={edit.lengths.biggestWin}
              max={WIN_MAX}
              error={edit.errors.biggestWin}
            />
            <TextField
              label={t("biggestChallenge")}
              placeholder={t("biggestChallengePlaceholder")}
              textarea={edit.fields.biggestChallenge}
              length={edit.lengths.biggestChallenge}
              max={CHALLENGE_MAX}
              error={edit.errors.biggestChallenge}
            />
          </>
        ) : (
          <>
            <ReadField
              label={t("biggestWin")}
              multiline
              value={read?.manual.biggestWin ?? dash}
            />
            <ReadField
              label={t("biggestChallenge")}
              multiline
              value={read?.manual.biggestChallenge ?? dash}
            />
          </>
        )}
      </section>

      <section aria-labelledby={totalsId}>
        <h2 id={totalsId} className="ph-h2 ph-rd-totals-h">
          {t("totalsTitle")}
        </h2>
        <PhoneStatGrid>
          <PhoneStat term={t("totalApplications")} mono>
            {formatNumber(metrics.totalApplications)}
          </PhoneStat>
          <PhoneStat term={t("totalScreenings")} mono>
            {formatNumber(metrics.totalScreenings)}
          </PhoneStat>
          <PhoneStat term={t("callbackRate")} mono>
            {rate(metrics.callbackRate)}
          </PhoneStat>
          <PhoneStat term={t("offerRate")} mono>
            {rate(metrics.offerRate)}
          </PhoneStat>
        </PhoneStatGrid>
      </section>

      <GoalSection
        headingId={goalId}
        edit={edit}
        readValue={read?.manual.nextGoal ?? dash}
      />
    </>
  );

  return (
    <>
      <PhoneTopBarEnd>
        <ReportStatusPill status={status} className="ph-rd-status" />
      </PhoneTopBarEnd>
      {edit ? (
        <form
          noValidate
          data-slot="phone-report-day"
          data-day={day}
          data-mode="edit"
          className="ph-app ph-rd"
          onSubmit={edit.onSubmit}
        >
          {body}
          <PhoneActionBar>
            <Link
              href={edit.cancelHref}
              data-action="cancel-report"
              className="ph-btn ph-sec ph-rd-cancel"
            >
              {t("cancel")}
            </Link>
            <button
              type="submit"
              data-action="submit-report"
              aria-disabled={edit.submitting || undefined}
              aria-busy={edit.submitting || undefined}
              data-disabled={edit.submitting || undefined}
              className="ph-btn ph-pri ph-rd-submit"
              onClick={(event) => {
                if (edit.submitting) event.preventDefault();
              }}
            >
              {edit.submitting ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {edit.submitting ? t("submitting") : t("submit")}
            </button>
          </PhoneActionBar>
        </form>
      ) : (
        <div
          data-slot="phone-report-day"
          data-day={day}
          data-mode="read"
          className="ph-app ph-rd ph-rd-readonly"
        >
          {body}
        </div>
      )}
    </>
  );
}

/** The board's shapes while the report loads, or its failure with Retry. */
export function ReportDayLoading({
  state = { status: "loading" },
}: {
  state?: PhoneLoad<unknown>;
}) {
  const t = useTranslations("phone.reportDay");
  return (
    <div data-slot="phone-report-day" className="ph-app ph-rd ph-rd-readonly">
      <PhoneLoadable
        state={state}
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="h-16" />
            <PhoneSkeletonCard className="h-[180px]" />
            <PhoneSkeletonCard className="h-[200px]" />
          </PhoneSkeleton>
        }
      >
        {() => null}
      </PhoneLoadable>
    </div>
  );
}

/** The ids that describe a field, in order; absent ones dropped. */
function describedBy(...ids: (string | null)[]): string {
  return ids.filter(Boolean).join(" ");
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="ph-hint text-(color:--destructive-text)">
      {message}
    </p>
  );
}

function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  return (
    <div className="ph-field ph-input-host">
      <span id={labelId} className="ph-lbl">
        {label}
      </span>
      <DatePickerInput
        id={id}
        value={value}
        onChange={onChange}
        maxDate={new Date()}
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function NumberField({
  label,
  input,
  error,
}: {
  label: string;
  input: ComponentProps<"input">;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="ph-field">
      <label htmlFor={id} className="ph-lbl">
        {label}
      </label>
      <input
        {...input}
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="ph-input ph-mono"
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function Counter({
  id,
  length,
  max,
}: {
  id: string;
  length: number;
  max: number;
}) {
  const t = useTranslations("reports.detail");
  const over = length > max;
  return (
    <span id={id} data-over={over || undefined} className="ph-mono ph-rd-count">
      {over
        ? t("overLimit", { count: length - max })
        : t("remaining", { count: max - length })}
    </span>
  );
}

function TextField({
  label,
  placeholder,
  textarea,
  length,
  max,
  error,
}: {
  label: string;
  placeholder: string;
  textarea: ComponentProps<"textarea">;
  length: number;
  max: number;
  error?: string;
}) {
  const id = useId();
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  return (
    <div className="ph-field">
      <label htmlFor={id} className="ph-lbl">
        {label}
      </label>
      <textarea
        {...textarea}
        id={id}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(countId, error ? errorId : null)}
        className="ph-input"
      />
      <Counter id={countId} length={length} max={max} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function ReadField({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="ph-field">
      <label htmlFor={id} className="ph-lbl">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} readOnly value={value} className="ph-input" />
      ) : (
        <input
          id={id}
          readOnly
          value={value}
          className={cn("ph-input", mono && "ph-mono")}
        />
      )}
    </div>
  );
}

function GoalSection({
  headingId,
  edit,
  readValue,
}: {
  headingId: string;
  edit: ReportDayEdit | null;
  readValue: string;
}) {
  const t = useTranslations("reports.detail");
  const id = useId();
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const error = edit?.errors.nextGoal;

  return (
    <section aria-labelledby={headingId} className="ph-field">
      <h2 id={headingId} className="ph-h2">
        {t("goalTitle")}
      </h2>
      <label htmlFor={id} className="ph-hint ph-rd-goal-lbl">
        {t.rich("goalPrompt", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </label>
      {edit ? (
        <>
          <textarea
            {...edit.fields.nextGoal}
            id={id}
            placeholder={t("goalPlaceholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(countId, error ? errorId : null)}
            className="ph-input"
          />
          <Counter id={countId} length={edit.lengths.nextGoal} max={GOAL_MAX} />
          <FieldError id={errorId} message={error} />
        </>
      ) : (
        <textarea id={id} readOnly value={readValue} className="ph-input" />
      )}
    </section>
  );
}

const REPORTS_HREF = "/reports";

function reportDayMetrics(data: ReportDetailResponse): ReportDayMetrics {
  const metrics = data.metrics;
  return {
    applications: metrics?.applications_count ?? 0,
    interviewsDone: metrics?.interviews_completed_fortnight ?? 0,
    offers: metrics?.offers_count ?? 0,
    activeProcesses: metrics?.active_processes_count ?? 0,
    totalApplications: metrics?.total_applications_count ?? 0,
    totalScreenings: metrics?.total_initial_screenings_count ?? 0,
    callbackRate: metrics?.callback_rate ?? 0,
    offerRate: metrics?.offer_rate ?? 0,
  };
}

/**
 * v2/ReportDay with its data (`/reports/<day>` below md, inside
 * `BadgeGate`): today's `useReportDetail`, the shared report form
 * (`useReportForm`) and submit. A day that is not a report day goes back to
 * the list, as today; so does a report that is not available yet.
 */
export function ReportDayScreen({ day }: { day: ReportDaysType }) {
  const router = useRouter();
  const dayNumber = Number(day);
  const valid = (ReportDays as readonly number[]).includes(dayNumber);

  useEffect(() => {
    if (!valid) router.replace(REPORTS_HREF);
  }, [valid, router]);

  if (!valid) return null;
  return <ReportDayDetail day={dayNumber as ReportDaysType} />;
}

function ReportDayDetail({ day }: { day: ReportDaysType }) {
  const router = useRouter();
  const { selectedCycleId } = useCycleContext();
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const detail = useReportDetail(day, startDate, selectedCycleId);
  // The list says whether the report is late (the detail does not).
  const list = useReports(selectedCycleId);
  const { reportData, isAvailable } = detail;

  useEffect(() => {
    if (isAvailable !== undefined && !isAvailable) router.push(REPORTS_HREF);
  }, [isAvailable, router]);

  const load = fromQuery({
    data: reportData ?? undefined,
    isError: detail.error !== null && reportData === null,
    error: detail.error,
    isFetching: detail.isValidating,
    refetch: detail.refetch,
  });
  if (load.status !== "ready" || !isAvailable) {
    return (
      <ReportDayLoading state={load.status === "error" ? load : undefined} />
    );
  }
  const data = load.data;

  const listed = list.reports.find((report) => report.day === day);
  const late =
    listed && effectiveReportStatus(listed, list.currentDay) === "overdue";
  const shared = {
    day,
    totalDays: REPORT_TOTAL_DAYS,
    phase: data.report?.phase ?? 1,
    metrics: reportDayMetrics(data),
  };

  if (data.can_submit) {
    return (
      <ReportDayEdit
        {...shared}
        status={late ? "overdue" : "pending"}
        reportData={data}
        onStartDateChange={setStartDate}
        onSubmitted={() => router.push(REPORTS_HREF)}
      />
    );
  }

  const manual = data.manual_metrics;
  return (
    <ReportDayScreenView
      {...shared}
      status="submitted"
      mode="read"
      startDate={data.period.start_date}
      manual={{
        mockInterviews: manual?.mock_interviews_count ?? null,
        linkedinPosts: manual?.linkedin_posts_count ?? null,
        strategicConnections: manual?.strategic_connections_count ?? null,
        biggestWin: manual?.biggest_win ?? null,
        biggestChallenge: manual?.biggest_challenge ?? null,
        nextGoal: manual?.next_fortnight_goal ?? null,
      }}
    />
  );
}

function ReportDayEdit({
  day,
  totalDays,
  phase,
  metrics,
  status,
  reportData,
  onStartDateChange,
  onSubmitted,
}: {
  day: ReportDaysType;
  totalDays: number;
  phase: number;
  metrics: ReportDayMetrics;
  status: "pending" | "overdue";
  reportData: ReportDetailResponse;
  onStartDateChange: (value: string | undefined) => void;
  onSubmitted: () => void;
}) {
  const form = useReportForm(reportData);
  const { submit, isSubmitting } = useReportSubmit();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form;
  const startDate = useWatch({ control, name: "start_date" });
  const biggestWin = useWatch({ control, name: "biggest_win" }) ?? "";
  const biggestChallenge =
    useWatch({ control, name: "biggest_challenge" }) ?? "";
  const nextGoal = useWatch({ control, name: "next_fortnight_goal" }) ?? "";

  return (
    <ReportDayScreenView
      mode="edit"
      day={day}
      totalDays={totalDays}
      phase={phase}
      status={status}
      metrics={metrics}
      onSubmit={handleSubmit(async (values) => {
        try {
          await submit(day, {
            start_date: values.start_date,
            mock_interviews_count: values.mock_interviews_count,
            linkedin_posts_count: values.linkedin_posts_count,
            strategic_connections_count: values.strategic_connections_count,
            biggest_win: values.biggest_win,
            biggest_challenge: values.biggest_challenge,
            next_fortnight_goal: values.next_fortnight_goal,
          });
        } catch {
          // The hook toasts it (or the gate takes over on AUTH-1050).
          return;
        }
        onSubmitted();
      })}
      submitting={isSubmitting}
      cancelHref={REPORTS_HREF}
      startDate={{
        value: startDate || undefined,
        onChange: (date) => {
          onStartDateChange(date);
          setValue("start_date", date ?? "", { shouldValidate: true });
        },
        // Only day 1 picks the challenge's start, as today.
        editable: day <= 1,
      }}
      fields={{
        mockInterviews: register("mock_interviews_count", {
          valueAsNumber: true,
        }),
        linkedinPosts: register("linkedin_posts_count", {
          valueAsNumber: true,
        }),
        strategicConnections: register("strategic_connections_count", {
          valueAsNumber: true,
        }),
        biggestWin: register("biggest_win"),
        biggestChallenge: register("biggest_challenge"),
        nextGoal: register("next_fortnight_goal"),
      }}
      lengths={{
        biggestWin: biggestWin.length,
        biggestChallenge: biggestChallenge.length,
        nextGoal: nextGoal.length,
      }}
      errors={{
        startDate: errors.start_date?.message,
        mockInterviews: errors.mock_interviews_count?.message,
        linkedinPosts: errors.linkedin_posts_count?.message,
        strategicConnections: errors.strategic_connections_count?.message,
        biggestWin: errors.biggest_win?.message,
        biggestChallenge: errors.biggest_challenge?.message,
        nextGoal: errors.next_fortnight_goal?.message,
      }}
    />
  );
}
