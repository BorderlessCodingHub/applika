import { calendarDaysBetween, parseDayKey } from "@/lib/phone-format";
import type { Application } from "@/services/types/applications";

/** The phone Pipeline's stages, in the board's group order (v2/Pipeline). */
export const PIPELINE_STAGES = [
  "technical",
  "screening",
  "applied",
  "offer",
  "closed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Time since an application's last update, in the board's units: days below
 * a week, weeks below eight, then months ("2d", "1w", "3mo").
 */
export interface PipelineAgo {
  unit: "day" | "week" | "month";
  count: number;
}

/** An open application with no update for MORE than this many days is stale (PRD 0021 Q6). */
export const STALE_DAYS = 14;

/** What the stage and the dates are read from. */
export type PipelineApplication = Pick<
  Application,
  "application_date" | "finalized_at" | "last_step"
>;

/** `last_step.name` as the API's reverse step map writes it (`step_translation.py`). */
const STEP_SCREENING = "Initial Screen";
const STEP_OFFER = "Offer";
const STEP_DENIED = "Denied";

/**
 * The application's stage, from the summary the API already sends (PRD 0021
 * Q8): closed once `finalized_at` is set; no event yet → Applied; "Initial
 * Screen" → Screening; "Offer" → Offer; "Denied" → Closed (an open
 * application whose latest event is a denial); any other interview ("Phase
 * 2") → Technical.
 */
export function pipelineStage(app: PipelineApplication): PipelineStage {
  if (app.finalized_at) return "closed";
  const step = app.last_step;
  if (!step) return "applied";
  if (step.name === STEP_SCREENING) return "screening";
  if (step.name === STEP_OFFER) return "offer";
  if (step.name === STEP_DENIED) return "closed";
  return "technical";
}

/**
 * The outcome a row shows: a closed application's Offer or Denied, and the
 * denial of an open one (it is listed under Closed). An open offer shows none
 * (it is in the Offer group).
 */
export function pipelineOutcome(
  app: PipelineApplication,
): "denied" | "offer" | null {
  const name = app.last_step?.name;
  if (name === STEP_DENIED) return "denied";
  if (name === STEP_OFFER && app.finalized_at) return "offer";
  return null;
}

/** The later of the application date and the latest event's date, "YYYY-MM-DD". */
export function lastUpdate(app: PipelineApplication): string {
  const applied = app.application_date.slice(0, 10);
  const event = app.last_step?.date?.slice(0, 10);
  return event && event > applied ? event : applied;
}

/** Whole local calendar days since `lastUpdate` (never below zero). */
export function quietDays(
  app: PipelineApplication,
  today: Date = new Date(),
): number {
  return Math.max(0, calendarDaysBetween(parseDayKey(lastUpdate(app)), today));
}

/** Open, and no update for more than `STALE_DAYS` days: 15 is stale, 14 is not. */
export function isStale(
  app: PipelineApplication,
  today: Date = new Date(),
): boolean {
  return !app.finalized_at && quietDays(app, today) > STALE_DAYS;
}

/** The board's "2d", "3w", "2mo": days below 7, weeks below 8, then months of 30 days. */
export function ago(days: number): PipelineAgo {
  const whole = Math.max(0, Math.floor(days));
  if (whole < 7) return { unit: "day", count: whole };
  if (whole < 8 * 7) return { unit: "week", count: Math.floor(whole / 7) };
  return { unit: "month", count: Math.floor(whole / 30) };
}

export interface StagedApplication<T> {
  app: T;
  stage: PipelineStage;
  outcome: "denied" | "offer" | null;
  days: number;
  stale: boolean;
}

/**
 * Every application under its stage, in the board's group order, each group
 * most recently updated first. A stage without applications is left out.
 */
export function groupByStage<T extends PipelineApplication>(
  apps: readonly T[],
  today: Date = new Date(),
): { stage: PipelineStage; rows: StagedApplication<T>[] }[] {
  const staged: StagedApplication<T>[] = apps.map((app) => ({
    app,
    stage: pipelineStage(app),
    outcome: pipelineOutcome(app),
    days: quietDays(app, today),
    stale: isStale(app, today),
  }));
  const newestFirst = (a: StagedApplication<T>, b: StagedApplication<T>) => {
    const byUpdate = lastUpdate(b.app).localeCompare(lastUpdate(a.app));
    return byUpdate !== 0
      ? byUpdate
      : b.app.application_date.localeCompare(a.app.application_date);
  };
  return PIPELINE_STAGES.flatMap((stage) => {
    const rows = staged.filter((row) => row.stage === stage).sort(newestFirst);
    return rows.length > 0 ? [{ stage, rows }] : [];
  });
}

/**
 * Today's "Needs your attention": the stale applications, most days without
 * an update first.
 */
export function attentionList<T extends PipelineApplication>(
  apps: readonly T[],
  today: Date = new Date(),
): { app: T; days: number }[] {
  return apps
    .filter((app) => isStale(app, today))
    .map((app) => ({ app, days: quietDays(app, today) }))
    .sort((a, b) => b.days - a.days);
}

/** The Application board's progress steps, in its order; Closed is not one. */
export type ReachedStage = "applied" | "screening" | "technical" | "offer";

const REACHED_ORDER: readonly ReachedStage[] = [
  "applied",
  "screening",
  "technical",
  "offer",
];

/** The stage one timeline event stands for, or `null` (a denial is no step). */
function eventStage(event: {
  event_type: string;
  interview_type?: string | null;
}): ReachedStage | null {
  if (event.event_type === "offer") return "offer";
  if (event.event_type !== "interview") return null;
  return event.interview_type === "initial_screening"
    ? "screening"
    : "technical";
}

/**
 * The furthest stage an application reached: from its timeline when it is
 * loaded (an offer, any interview other than the screening, the screening),
 * else from `last_step` (a closed or denied application then reads Applied
 * until its events arrive).
 */
export function reachedStage(
  app: PipelineApplication,
  events?: readonly { event_type: string; interview_type?: string | null }[],
): ReachedStage {
  if (events) {
    let best = 0;
    for (const event of events) {
      const stage = eventStage(event);
      if (stage) best = Math.max(best, REACHED_ORDER.indexOf(stage));
    }
    return REACHED_ORDER[best];
  }
  const stage = pipelineStage(app);
  return stage === "closed" ? "applied" : stage;
}
