/**
 * Presentation config for the timeline event types (PRD 0008, ADR 0012).
 *
 * One entry per hardcoded `event_type`, pairing it with a distinct Lucide icon
 * and an accent drawn from the EXISTING semantic tokens (no new tokens):
 *   note      → neutral / muted
 *   interview → info (blue)
 *   feedback  → warning (amber)
 *   offer     → success (green)
 *   denied    → destructive (red)
 *
 * All colour utilities are written as literal class strings (never interpolated)
 * so Tailwind's scanner keeps them. Reuse these for the type selector, the read-
 * only badge, the timeline rail and the dashboard stage charts so one type reads
 * the same colour everywhere.
 */

import type { ComponentType } from "react";
import {
  BadgeCheck,
  CalendarClock,
  CircleX,
  MessageSquareText,
  StickyNote,
  type LucideProps,
} from "lucide-react";

import {
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  TIMELINE_EVENT_TYPES,
  type InterviewType,
  type SalaryCurrency,
  type SalaryPeriod,
  type TimelineEventType,
} from "@/components/timeline/timeline-types";

export interface SelectOption {
  value: string;
  label: string;
}

export interface EventTypeConfig {
  value: TimelineEventType;
  /** Human label rendered in badges, chips, and read-only views. */
  label: string;
  /** Distinct Lucide icon for this type. */
  icon: ComponentType<LucideProps>;
  /** One-line helper shown under the selector chip / dialog description. */
  hint: string;
  /** Tinted pill classes for the read-only `EventTypeBadge` (bg + text). */
  badgeClass: string;
  /** Tinted square icon-tile classes (bg + text + ring) for compact affordances. */
  tileClass: string;
  /** Solid node-dot classes for the timeline rail. */
  dotClass: string;
  /** Selected-state chip classes for `EventTypeSelector`. */
  selectedClass: string;
  /** Token colour for chart fills (recharts `fill`), e.g. the stage bars. */
  chartColor: string;
}

export const EVENT_TYPE_CONFIG: Record<TimelineEventType, EventTypeConfig> = {
  note: {
    value: "note",
    label: "Note",
    icon: StickyNote,
    hint: "A general observation or reminder.",
    badgeClass: "bg-muted text-muted-foreground",
    tileClass: "bg-muted text-muted-foreground ring-border",
    dotClass: "bg-muted-foreground/60",
    selectedClass: "border-muted-foreground/40 bg-accent text-foreground",
    chartColor: "var(--muted-foreground)",
  },
  interview: {
    value: "interview",
    label: "Interview",
    icon: CalendarClock,
    hint: "A scheduled conversation or assessment.",
    badgeClass: "bg-info/15 text-info",
    tileClass: "bg-info/15 text-info ring-info/25",
    dotClass: "bg-info",
    selectedClass: "border-info/50 bg-info/10 text-foreground",
    chartColor: "var(--info)",
  },
  feedback: {
    value: "feedback",
    label: "Feedback",
    icon: MessageSquareText,
    hint: "Response or notes received about you.",
    badgeClass: "bg-warning/15 text-warning",
    tileClass: "bg-warning/15 text-warning ring-warning/25",
    dotClass: "bg-warning",
    selectedClass: "border-warning/50 bg-warning/10 text-foreground",
    chartColor: "var(--warning)",
  },
  offer: {
    value: "offer",
    label: "Offer",
    icon: BadgeCheck,
    hint: "An offer was extended — record the salary.",
    badgeClass: "bg-success/15 text-success",
    tileClass: "bg-success/15 text-success ring-success/25",
    dotClass: "bg-success",
    selectedClass: "border-success/50 bg-success/10 text-foreground",
    chartColor: "var(--success)",
  },
  denied: {
    value: "denied",
    label: "Denied",
    icon: CircleX,
    hint: "The application was rejected or withdrawn.",
    badgeClass: "bg-destructive/15 text-destructive",
    tileClass: "bg-destructive/15 text-destructive ring-destructive/25",
    dotClass: "bg-destructive",
    selectedClass: "border-destructive/50 bg-destructive/10 text-foreground",
    chartColor: "var(--destructive)",
  },
};

/** Ordered config list — drive the selector and any legend off this. */
export const EVENT_TYPE_OPTIONS: readonly EventTypeConfig[] =
  TIMELINE_EVENT_TYPES.map((type) => EVENT_TYPE_CONFIG[type]);

export interface InterviewTypeConfig {
  value: InterviewType;
  /** Human label for the select, the card badge and tooltips. */
  label: string;
  /** Compact label for a chart axis. */
  shortLabel: string;
}

export const INTERVIEW_TYPE_CONFIG: Record<InterviewType, InterviewTypeConfig> =
  {
    unknown: {
      value: "unknown",
      label: "Unknown",
      shortLabel: "Unknown",
    },
    initial_screening: {
      value: "initial_screening",
      label: "Initial screening",
      shortLabel: "Screening",
    },
    technical: {
      value: "technical",
      label: "Technical",
      shortLabel: "Technical",
    },
    cultural: {
      value: "cultural",
      label: "Cultural",
      shortLabel: "Cultural",
    },
    hiring_manager: {
      value: "hiring_manager",
      label: "Hiring manager",
      shortLabel: "Manager",
    },
    take_home: {
      value: "take_home",
      label: "Take-home",
      shortLabel: "Take-home",
    },
    final: {
      value: "final",
      label: "Final",
      shortLabel: "Final",
    },
  };

/** Ordered interview type list — drive the select off this. */
export const INTERVIEW_TYPE_OPTIONS: readonly InterviewTypeConfig[] =
  INTERVIEW_TYPES.map((type) => INTERVIEW_TYPE_CONFIG[type]);

/** value -> label lookup for a saved interview type. */
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> =
  Object.fromEntries(
    INTERVIEW_TYPE_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<InterviewType, string>;

/** The default interview type for a new interview event. */
export const DEFAULT_INTERVIEW_TYPE: InterviewType = "unknown";

export interface SalaryPeriodOption extends SelectOption {
  value: SalaryPeriod;
  /** Compact suffix appended to an amount, e.g. `/yr`. */
  suffix: string;
}

/** Every salary period the API can return, with its label and amount suffix. */
export const SALARY_PERIOD_OPTIONS: readonly SalaryPeriodOption[] = [
  { value: "hourly", label: "Hourly", suffix: "/hr" },
  { value: "monthly", label: "Monthly", suffix: "/mo" },
  { value: "annually", label: "Annually", suffix: "/yr" },
];

/** value -> label lookup for a saved salary period. */
export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> =
  Object.fromEntries(
    SALARY_PERIOD_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SalaryPeriod, string>;

/** value -> amount suffix lookup, e.g. `hourly` -> `/hr`. */
export const SALARY_PERIOD_SUFFIXES: Record<SalaryPeriod, string> =
  Object.fromEntries(
    SALARY_PERIOD_OPTIONS.map((option) => [option.value, option.suffix]),
  ) as Record<SalaryPeriod, string>;

/**
 * Offer salary period options — restricted to `monthly | annually`. Derived from
 * `SALARY_PERIOD_OPTIONS` so labels stay in one place.
 */
export const OFFER_SALARY_PERIOD_OPTIONS: readonly SelectOption[] =
  SALARY_PERIOD_OPTIONS.filter(
    (option) => option.value === "monthly" || option.value === "annually",
  );

export interface CurrencyOption extends SelectOption {
  value: SalaryCurrency;
  /** Display symbol. Not unique (SEK/NOK/DKK share `kr`), so never parse it. */
  symbol: string;
}

const CURRENCY_SYMBOLS: Record<SalaryCurrency, string> = {
  USD: "$",
  BRL: "R$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CHF: "CHF",
  INR: "₹",
  CNY: "CN¥",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr.",
  PLN: "zł",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  MXN: "MX$",
  ZAR: "R",
  AED: "AED",
};

/** The 20 salary currencies in API order. `label` is the ISO code. */
export const CURRENCY_OPTIONS: readonly CurrencyOption[] =
  SALARY_CURRENCIES.map((code) => ({
    value: code,
    label: code,
    symbol: CURRENCY_SYMBOLS[code],
  }));

/** One dashboard stage: an interview type, or `offer` / `denied`. */
export interface TimelineStage {
  eventType: TimelineEventType;
  interviewType: InterviewType | null;
}

/** The 9 stages in the order the statistics endpoints return them. */
export const TIMELINE_STAGES: readonly TimelineStage[] = [
  ...INTERVIEW_TYPES.map((interviewType) => ({
    eventType: "interview" as const,
    interviewType,
  })),
  { eventType: "offer", interviewType: null },
  { eventType: "denied", interviewType: null },
];

/**
 * Full stage label, e.g. "Interview · Technical", "Offer". Use it for tooltips,
 * agenda items and anywhere a type is named on its own.
 */
export function stageLabel(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  const base = EVENT_TYPE_CONFIG[eventType].label;
  if (eventType !== "interview") return base;
  return `${base} · ${INTERVIEW_TYPE_LABELS[interviewType ?? DEFAULT_INTERVIEW_TYPE]}`;
}

/**
 * Compact stage label for a chart axis, e.g. "Screening", "Offer". Interview
 * stages drop the "Interview ·" prefix; pair the axis with `stageLabel` in the
 * tooltip.
 */
export function stageShortLabel(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  if (eventType !== "interview") return EVENT_TYPE_CONFIG[eventType].label;
  return INTERVIEW_TYPE_CONFIG[interviewType ?? DEFAULT_INTERVIEW_TYPE]
    .shortLabel;
}
