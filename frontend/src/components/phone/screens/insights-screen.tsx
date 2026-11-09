"use client";

import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhoneOption, PhoneOptionGroup } from "@/components/phone/phone-option";
import {
  bothLoad,
  fromQuery,
  mapLoad,
} from "@/components/phone/phone-query-load";
import { PhoneSheet } from "@/components/phone/phone-sheet";
import { useAuth } from "@/contexts/auth-context";
import { useCycleContext } from "@/contexts/cycle-context";
import { useApplications } from "@/hooks/use-applications";
import { useCycles } from "@/hooks/use-cycles";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import {
  useGeneralStats,
  useModeStats,
  useStepAvgDays,
  useStepConversion,
} from "@/hooks/use-statistics";
import { useFormatNumber } from "@/i18n/format-number";
import {
  funnel as funnelRows,
  insightsSummary,
  modeSplit,
  stepDays as stepDayRows,
  weekly as weeklyRows,
} from "@/lib/insights";
import { initials as initialsOf, parseDayKey } from "@/lib/phone-format";
import { cn } from "@/lib/utils";

/** The funnel's rows, in the board's order (v2/Insights). */
export const INSIGHTS_FUNNEL_STAGES = [
  "applied",
  "screening",
  "technical",
  "offer",
] as const;

export type InsightsFunnelStage = (typeof INSIGHTS_FUNNEL_STAGES)[number];

/** Average days per step, in the board's order and words. */
export const INSIGHTS_STEP_KEYS = [
  "appliedToScreening",
  "screeningToTechnical",
  "technicalToOffer",
] as const;

export type InsightsStepKey = (typeof INSIGHTS_STEP_KEYS)[number];

/** Applications per week covers this many ISO weeks. */
export const INSIGHTS_WEEK_COUNT = 8;

export interface InsightsCycle {
  id: string;
  name: string;
}

export interface InsightsSummary {
  /** A percentage, as `GeneralStats.success_rate` sends it (5.9 is 5.9%). */
  successRate: number;
  offers: number;
  /** `total_applications`: 0 shows today's empty words instead of the charts. */
  applications: number;
  active: number;
}

export interface InsightsFunnelRow {
  stage: InsightsFunnelStage;
  count: number;
  /** Whole percent of Applied (the bar draws at least 3%). */
  percent: number;
}

export interface InsightsWeek {
  /** The ISO week's Monday, local midnight. */
  weekStart: Date;
  count: number;
}

export interface InsightsStepDays {
  key: InsightsStepKey;
  /** Whole days, never below zero; `null` reads as a dash. */
  days: number | null;
}

export interface InsightsMode {
  active: number;
  passive: number;
}

export interface InsightsScreenViewProps {
  /** Already uppercased (`initials()`). */
  initials: string;
  /** "Current Cycle" or the archived cycle's name: the pill's words. */
  cycleLabel: string;
  /** `null` is the current cycle (`CycleProvider`). */
  selectedCycleId: string | null;
  /** The archived cycles (`useCycles`); the sheet lists the current one first. */
  archivedCycles: readonly InsightsCycle[];
  onCycleChange: (cycleId: string | null) => void;
  /** An archived cycle is viewed: said under the header. */
  archived: boolean;
  summary: PhoneLoad<InsightsSummary>;
  funnel: PhoneLoad<readonly InsightsFunnelRow[]>;
  /** Oldest first, `INSIGHTS_WEEK_COUNT` weeks, empty weeks 0. */
  weekly: PhoneLoad<readonly InsightsWeek[]>;
  stepDays: PhoneLoad<readonly InsightsStepDays[]>;
  mode: PhoneLoad<InsightsMode>;
}

const CURRENT_CYCLE = "current";

/** A section's error inside a board card: the card is already drawn. */
const INSET_ERROR = "mt-4 rounded-none bg-transparent p-0 shadow-none";

/** v2/Insights below md: props in, the board out. */
export function InsightsScreenView({
  initials,
  cycleLabel,
  selectedCycleId,
  archivedCycles,
  onCycleChange,
  archived,
  summary,
  funnel,
  weekly,
  stepDays,
  mode,
}: InsightsScreenViewProps) {
  const t = useTranslations("phone.insights");
  const tShell = useTranslations("phone.shell");
  const tCycle = useTranslations("cycleSelector");
  const tDashboard = useTranslations("dashboard");
  const tPage = useTranslations("applications.page");
  const cycleHintId = useId();
  const [cyclesOpen, setCyclesOpen] = useState(false);

  const empty = summary.status === "ready" && summary.data.applications === 0;

  return (
    <div
      data-slot="phone-insights"
      data-archived={archived || undefined}
      className="ph-app ph-ins"
    >
      <div className="ph-ins-head">
        <h1 className="ph-h1">{tShell("insights")}</h1>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={cyclesOpen}
          aria-describedby={cycleHintId}
          data-action="choose-cycle"
          className="ph-ins-cycle"
          onClick={() => setCyclesOpen(true)}
        >
          <span className="ph-ins-cycle-name">{cycleLabel}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <span id={cycleHintId} className="ph-sr">
          {t("chooseCycle")}
        </span>
        <PhoneAvatar initials={initials} />
      </div>
      {archived ? (
        <p data-slot="insights-archived" className="ph-ins-archived">
          {tDashboard("subtitlePast")}
        </p>
      ) : null}

      <RateCard summary={summary} />

      {empty ? (
        <p data-slot="insights-empty" className="ph-card-lg ph-ins-empty">
          {tPage("emptyTitle")}
        </p>
      ) : (
        <>
          <FunnelCard funnel={funnel} />
          <WeeklyCard weekly={weekly} />
          <StepDaysCard stepDays={stepDays} />
          <ModeCard mode={mode} />
        </>
      )}

      <PhoneSheet
        open={cyclesOpen}
        onOpenChange={setCyclesOpen}
        title={t("chooseCycle")}
        showClose
      >
        {/* A tap picks and closes; arrow keys pick and keep the sheet open (Radix clicks on arrow focus, with detail 0). */}
        <div
          data-slot="insights-cycles"
          className="ph-scroll mt-4 min-h-0 overflow-y-auto p-1"
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            if (event.detail > 0 && target.closest('[role="radio"]')) {
              setCyclesOpen(false);
            }
          }}
        >
          <PhoneOptionGroup
            label={t("chooseCycle")}
            value={selectedCycleId ?? CURRENT_CYCLE}
            onValueChange={(value) =>
              onCycleChange(value === CURRENT_CYCLE ? null : value)
            }
          >
            <PhoneOption value={CURRENT_CYCLE} title={tCycle("current")} />
            {archivedCycles.map((cycle) => (
              <PhoneOption key={cycle.id} value={cycle.id} title={cycle.name} />
            ))}
          </PhoneOptionGroup>
        </div>
      </PhoneSheet>
    </div>
  );
}

function RateCard({ summary }: { summary: PhoneLoad<InsightsSummary> }) {
  const t = useTranslations("phone.insights");
  const tStats = useTranslations("dashboard.stats");
  const formatNumber = useFormatNumber();
  const labelId = useId();

  return (
    <section
      aria-labelledby={labelId}
      data-slot="insights-rate"
      className="ph-card-lg ph-ins-hero"
    >
      <p id={labelId} className="ph-ins-label">
        {t("successRate")}
      </p>
      <PhoneLoadable
        state={summary}
        errorClassName={INSET_ERROR}
        loading={<InsetSkeleton className="mt-1.5 h-[140px]" />}
      >
        {(data) => {
          // The board writes one decimal ("5.9%"); a whole rate keeps none.
          const rate = Math.round(data.successRate * 10) / 10;
          const words = `${formatNumber(rate)}%`;
          return (
            <>
              <p className="ph-mono ph-ins-rate">{words}</p>
              <div
                role="progressbar"
                aria-label={t("successRate")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={rate}
                aria-valuetext={words}
                className="ph-ins-meter"
              >
                <div
                  className="ph-ins-meter-fill"
                  style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                />
              </div>
              <dl className="ph-ins-dl">
                <Stat
                  label={tStats("offers")}
                  value={formatNumber(data.offers)}
                  primary
                />
                <Stat
                  label={t("applications")}
                  value={formatNumber(data.applications)}
                />
                <Stat
                  label={tStats("active")}
                  value={formatNumber(data.active)}
                />
              </dl>
            </>
          );
        }}
      </PhoneLoadable>
    </section>
  );
}

function Stat({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="ph-ins-stat">
      <dt className="ph-ins-stat-label">{label}</dt>
      <dd className={cn("ph-mono ph-ins-stat-value", primary && "ph-pri")}>
        {value}
      </dd>
    </div>
  );
}

function FunnelCard({
  funnel,
}: {
  funnel: PhoneLoad<readonly InsightsFunnelRow[]>;
}) {
  const t = useTranslations("phone.insights");
  const tStage = useTranslations("phone.pipeline.stage");
  const formatNumber = useFormatNumber();

  return (
    <InsightsCard
      slot="insights-funnel"
      title={t("funnel")}
      sub={t("funnelSub")}
    >
      <PhoneLoadable
        state={funnel}
        errorClassName={INSET_ERROR}
        loading={<InsetSkeleton className="mt-4 h-[176px]" />}
      >
        {(rows) => (
          <div className="ph-ins-funnel">
            {INSIGHTS_FUNNEL_STAGES.map((stage, index) => {
              const row = rows.find((r) => r.stage === stage) ?? {
                stage,
                count: 0,
                percent: 0,
              };
              return (
                <div key={stage} data-stage={stage}>
                  <div className="ph-ins-fn-head">
                    <span className="ph-ins-fn-label">{tStage(stage)}</span>
                    <span>
                      <span className="ph-mono ph-ins-fn-n">
                        {formatNumber(row.count)}
                      </span>{" "}
                      <span className="ph-mono ph-ins-fn-pct">
                        {formatNumber(row.percent)}%
                      </span>
                    </span>
                  </div>
                  <div aria-hidden="true" className="ph-ins-track">
                    <div
                      data-step={index}
                      className="ph-ins-fill"
                      style={{ width: `${Math.max(row.percent, 3)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PhoneLoadable>
    </InsightsCard>
  );
}

function WeeklyCard({
  weekly,
}: {
  weekly: PhoneLoad<readonly InsightsWeek[]>;
}) {
  const t = useTranslations("phone.insights");
  const formatNumber = useFormatNumber();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      data-slot="insights-weekly"
      className="ph-card-lg"
    >
      <div className="ph-ins-week-head">
        <h2 id={titleId} className="ph-h2-sm">
          {t("perWeek")}
        </h2>
        <span className="ph-sub">
          {t("weeks", { count: INSIGHTS_WEEK_COUNT })}
        </span>
      </div>
      <PhoneLoadable
        state={weekly}
        errorClassName={INSET_ERROR}
        loading={<InsetSkeleton className="mt-[18px] h-[110px]" />}
      >
        {(weeks) => {
          const counts = weeks.map((week) => week.count);
          const max = Math.max(0, ...counts);
          const first = counts[0] ?? 0;
          const last = counts[counts.length - 1] ?? 0;
          return (
            <div
              role="img"
              aria-label={t("weeklyChart", {
                trend:
                  last > first ? "rising" : last < first ? "falling" : "steady",
                first: formatNumber(first),
                last: formatNumber(last),
                values: counts.map((count) => formatNumber(count)).join(", "),
              })}
              className="ph-ins-weeks"
            >
              {weeks.map((week) => (
                <div
                  key={week.weekStart.getTime()}
                  data-week={week.weekStart.getTime()}
                  className="ph-ins-week"
                >
                  <span className="ph-mono ph-ins-week-v">
                    {formatNumber(week.count)}
                  </span>
                  <div
                    className="ph-ins-week-bar"
                    style={{
                      height: `${max > 0 ? Math.round((week.count / max) * 80) : 0}px`,
                    }}
                  />
                </div>
              ))}
            </div>
          );
        }}
      </PhoneLoadable>
    </section>
  );
}

function StepDaysCard({
  stepDays,
}: {
  stepDays: PhoneLoad<readonly InsightsStepDays[]>;
}) {
  const t = useTranslations("phone.insights");

  return (
    <InsightsCard slot="insights-step-days" title={t("stepDays")}>
      <PhoneLoadable
        state={stepDays}
        errorClassName={INSET_ERROR}
        loading={<InsetSkeleton className="mt-3 h-[132px]" />}
      >
        {(rows) => (
          <dl className="ph-ins-days">
            {INSIGHTS_STEP_KEYS.map((key) => {
              const days = rows.find((row) => row.key === key)?.days ?? null;
              return (
                <div key={key} data-step={key} className="ph-ins-day">
                  <dt className="ph-ins-day-label">{t(`step.${key}`)}</dt>
                  <dd className="ph-mono ph-ins-day-value">
                    {days === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="ph-sr">{t("noData")}</span>
                      </>
                    ) : (
                      t("days", { days: Math.max(0, Math.round(days)) })
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </PhoneLoadable>
    </InsightsCard>
  );
}

function ModeCard({ mode }: { mode: PhoneLoad<InsightsMode> }) {
  const t = useTranslations("phone.insights");
  const tMode = useTranslations("dashboard.mode");
  const formatNumber = useFormatNumber();

  return (
    <InsightsCard slot="insights-mode" title={t("mode")} sub={t("modeSub")}>
      <PhoneLoadable
        state={mode}
        errorClassName={INSET_ERROR}
        loading={<InsetSkeleton className="mt-3.5 h-[46px]" />}
      >
        {({ active, passive }) => {
          const total = active + passive;
          return (
            <>
              <div
                aria-hidden="true"
                data-empty={total === 0 || undefined}
                className="ph-ins-mode"
              >
                {active > 0 ? (
                  <div
                    className="ph-ins-mode-a"
                    style={{
                      width: `${passive > 0 ? Math.round((active / total) * 100) : 100}%`,
                    }}
                  />
                ) : null}
                {passive > 0 ? <div className="ph-ins-mode-p" /> : null}
              </div>
              <div className="ph-ins-legend">
                <span data-mode="active" className="ph-ins-key">
                  <span
                    aria-hidden="true"
                    data-mode="active"
                    className="ph-ins-swatch"
                  />
                  {tMode("active")}{" "}
                  <span className="ph-mono ph-ins-key-n">
                    {formatNumber(active)}
                  </span>
                </span>
                <span data-mode="passive" className="ph-ins-key">
                  <span
                    aria-hidden="true"
                    data-mode="passive"
                    className="ph-ins-swatch"
                  />
                  {tMode("passive")}{" "}
                  <span className="ph-mono ph-ins-key-n">
                    {formatNumber(passive)}
                  </span>
                </span>
              </div>
            </>
          );
        }}
      </PhoneLoadable>
    </InsightsCard>
  );
}

function InsightsCard({
  slot,
  title,
  sub,
  children,
}: {
  slot: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-slot={slot} className="ph-card-lg">
      <h2 id={titleId} className="ph-h2-sm">
        {title}
      </h2>
      {sub ? <p className="ph-sub">{sub}</p> : null}
      {children}
    </section>
  );
}

/** Loading shapes inside a board card, read once as "Loading your numbers". */
function InsetSkeleton({ className }: { className: string }) {
  const tStats = useTranslations("phone.today.stats");
  return (
    <PhoneSkeleton label={tStats("loading")}>
      <PhoneSkeletonCard
        className={cn("rounded-lg bg-muted shadow-none", className)}
      />
    </PhoneSkeleton>
  );
}

/**
 * v2/Insights, wired, on the cycle the whole app views
 * (`CycleProvider`): the cycle pill's sheet is where a phone picks it, and
 * the Pipeline follows. The statistics hooks for the rate, the funnel, the
 * days per step and active vs passive; the weekly bars from the cycle's
 * applications (`lib/insights.ts`), ending with this week, or with the week
 * of an archived cycle's last application.
 */
export function InsightsScreen() {
  const tCycle = useTranslations("cycleSelector");
  const { user } = useAuth();
  const now = useMinuteClock();
  const { selectedCycleId, setSelectedCycleId, isViewingPastCycle } =
    useCycleContext();
  const cycles = useCycles();
  const general = fromQuery(useGeneralStats(selectedCycleId));
  const conversion = fromQuery(useStepConversion(selectedCycleId));
  const avgDays = fromQuery(useStepAvgDays(selectedCycleId));
  const mode = fromQuery(useModeStats(selectedCycleId));
  const apps = useApplications(selectedCycleId);

  const cycleLabel =
    selectedCycleId === null
      ? tCycle("current")
      : (cycles.data?.find((cycle) => cycle.id === selectedCycleId)?.name ??
        "");

  const weekly = mapLoad(
    fromQuery({
      data: apps.applications,
      isError: apps.isError,
      error: apps.error,
      isFetching: apps.isFetching,
      refetch: apps.refetch,
    }),
    (list) => {
      const dates = list.map((app) => app.application_date);
      const latest = dates.reduce<string | null>(
        (max, date) => (max === null || date > max ? date : max),
        null,
      );
      const end =
        isViewingPastCycle && latest !== null ? parseDayKey(latest) : now;
      return weeklyRows(dates, end);
    },
  );

  return (
    <InsightsScreenView
      initials={user ? initialsOf(user) : ""}
      cycleLabel={cycleLabel}
      selectedCycleId={selectedCycleId}
      archivedCycles={(cycles.data ?? []).map((cycle) => ({
        id: cycle.id,
        name: cycle.name,
      }))}
      onCycleChange={setSelectedCycleId}
      archived={isViewingPastCycle}
      summary={mapLoad(general, insightsSummary)}
      funnel={mapLoad(bothLoad(general, conversion), ([g, c]) =>
        funnelRows(g, c),
      )}
      weekly={weekly}
      stepDays={mapLoad(bothLoad(conversion, avgDays), ([c, a]) =>
        stepDayRows(c, a),
      )}
      mode={mapLoad(mode, modeSplit)}
    />
  );
}
