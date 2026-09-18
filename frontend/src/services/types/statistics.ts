export interface GeneralStats {
  total_applications: number;
  success_rate: number;
  offers: number;
  denials: number;
}

export interface ApiTrendPoint {
  application_date: string;
  total_applications: number;
}

export interface TrendPoint {
  application_date: string;
  label: string;
  total_applications: number;
}

import type {
  InterviewType,
  TimelineEventType,
} from "@/components/timeline/timeline-types";

/**
 * One row of `GET /applications/statistics/steps/conversion_rate` (PRD 0008,
 * ADR 0012). A "step" is now a timeline STAGE — an interview type, or
 * `offer`/`denied` — never a step-definition row (R-021/R-023). Always 9 rows,
 * in `TIMELINE_STAGES` order (`@/components/timeline/timeline-options`).
 */
export interface StepConversion {
  event_type: TimelineEventType;
  interview_type: InterviewType | null;
  conversion_rate: number;
  total_applications: number;
}

/**
 * One row of `GET /applications/statistics/steps/avarage_days` (sic — the
 * real path). Same stage shape as `StepConversion`.
 */
export interface StepAvgDays {
  event_type: TimelineEventType;
  interview_type: InterviewType | null;
  average_days: number;
}

export interface PlatformStat {
  id: string;
  name: string;
  total_applications: number;
}

export interface ModeStat {
  passive: number;
  active: number;
}
