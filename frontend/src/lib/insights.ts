import type {
  InsightsFunnelRow,
  InsightsMode,
  InsightsStepDays,
  InsightsSummary,
  InsightsWeek,
} from "@/components/phone/screens/insights-screen";
import { addDays, mondayOf, parseDayKey } from "@/lib/phone-format";
import type {
  GeneralStats,
  ModeStat,
  StepAvgDays,
  StepConversion,
} from "@/services/types/statistics";

/** A stage the phone Insights reads from the statistics rows (plan `## Contract`). */
interface StageKey {
  event_type: StepConversion["event_type"];
  interview_type: StepConversion["interview_type"];
}

const SCREENING: StageKey = {
  event_type: "interview",
  interview_type: "initial_screening",
};
const TECHNICAL: StageKey = {
  event_type: "interview",
  interview_type: "technical",
};
const OFFER: StageKey = { event_type: "offer", interview_type: null };

function rowOf<T extends StageKey>(
  rows: readonly T[] | undefined,
  key: StageKey,
): T | undefined {
  return rows?.find(
    (row) =>
      row.event_type === key.event_type &&
      (row.interview_type ?? null) === key.interview_type,
  );
}

/** The rate card: success rate, offers, applications and active, as the API counts them. */
export function insightsSummary(general: GeneralStats): InsightsSummary {
  return {
    successRate: general.success_rate,
    offers: general.offers,
    applications: general.total_applications,
    active: general.active,
  };
}

/**
 * The funnel: Applied = every application; Screening, Technical and Offer =
 * the applications that reached that stage (the conversion row's
 * `total_applications`), each as a whole percent of Applied.
 */
export function funnel(
  general: GeneralStats,
  conversion: readonly StepConversion[],
): InsightsFunnelRow[] {
  const applied = general.total_applications;
  const percent = (count: number) =>
    applied > 0 ? Math.round((count / applied) * 100) : 0;
  const count = (key: StageKey) =>
    rowOf(conversion, key)?.total_applications ?? 0;
  const rows: [InsightsFunnelRow["stage"], number][] = [
    ["applied", applied],
    ["screening", count(SCREENING)],
    ["technical", count(TECHNICAL)],
    ["offer", count(OFFER)],
  ];
  return rows.map(([stage, n]) => ({ stage, count: n, percent: percent(n) }));
}

/**
 * Applications per ISO week (Monday first) of their `application_date`, the
 * last `weeks` weeks ending with the week of `today`, oldest first; a week
 * with none is 0. Dates are local calendar days, never UTC instants.
 */
export function weekly(
  applicationDates: readonly string[],
  today: Date = new Date(),
  weeks = 8,
): InsightsWeek[] {
  const last = mondayOf(today);
  const starts = Array.from({ length: weeks }, (_, index) =>
    addDays(last, (index - (weeks - 1)) * 7),
  );
  const counts = new Map(starts.map((start) => [start.getTime(), 0]));
  for (const value of applicationDates) {
    const key = mondayOf(parseDayKey(value)).getTime();
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return starts.map((weekStart) => ({
    weekStart,
    count: counts.get(weekStart.getTime()) ?? 0,
  }));
}

/**
 * Average days per step (PRD 0021 Q7): "Applied → Screening" is the average
 * days to Screening; each later row is the gap between its two stages'
 * averages, never below zero; whole days. A row is `null` (a dash) when
 * either of its stages has no application in its conversion row.
 */
export function stepDays(
  conversion: readonly StepConversion[],
  avgDays: readonly StepAvgDays[],
): InsightsStepDays[] {
  const has = (key: StageKey) =>
    (rowOf(conversion, key)?.total_applications ?? 0) > 0;
  const avg = (key: StageKey) => rowOf(avgDays, key)?.average_days ?? 0;
  const gap = (from: StageKey, to: StageKey) =>
    has(from) && has(to) ? Math.max(0, Math.round(avg(to) - avg(from))) : null;
  return [
    {
      key: "appliedToScreening",
      days: has(SCREENING) ? Math.max(0, Math.round(avg(SCREENING))) : null,
    },
    { key: "screeningToTechnical", days: gap(SCREENING, TECHNICAL) },
    { key: "technicalToOffer", days: gap(TECHNICAL, OFFER) },
  ];
}

/** Active vs passive, as the API counts them. */
export function modeSplit(mode: ModeStat): InsightsMode {
  return { active: mode.active, passive: mode.passive };
}
