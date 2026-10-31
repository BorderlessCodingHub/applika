/**
 * Presentation config for the timeline event types (PRD 0008, ADR 0012).
 *
 * One entry per hardcoded `event_type`, pairing it with a distinct Lucide icon
 * and an accent drawn from the EXISTING semantic tokens (no new tokens):
 *   interview → info (blue)
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
  CircleDashed,
  CircleX,
  Users,
  type LucideProps,
} from "lucide-react";

import { FINALIZE_OUTCOME_COPY } from "@/components/applications/application-close-copy";
import {
  DENIED_REASONS,
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  TIMELINE_EVENT_TYPES,
  type DeniedReason,
  type InterviewType,
  type SalaryCurrency,
  type SalaryPeriod,
  type TimelineEventType,
} from "@/components/timeline/timeline-types";
import { word } from "@/i18n/translator";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * What `EventTypeSelector` can offer: a real event type, or `none` — the
 * close dialog's "close without an outcome", which is never an event and
 * never reaches the API's timeline payload.
 */
export type EventTypeChoice = TimelineEventType | "none";

/** One chip of `EventTypeSelector`. */
export interface EventTypeOption {
  value: EventTypeChoice;
  /** Human label rendered in badges, chips, and read-only views. */
  label: string;
  /** Distinct Lucide icon for this type. */
  icon: ComponentType<LucideProps>;
  /** One-line helper shown under the selector chip / dialog description. */
  hint: string;
  /** Tinted square icon-tile classes (bg + text + ring) for compact affordances. */
  tileClass: string;
  /** Selected-state chip classes for `EventTypeSelector`. */
  selectedClass: string;
}

export interface EventTypeConfig extends EventTypeOption {
  value: TimelineEventType;
  /** Tinted pill classes for the read-only `EventTypeBadge` (bg + text). */
  badgeClass: string;
  /** Solid node-dot classes for the timeline rail. */
  dotClass: string;
  /** Token colour for chart fills (recharts `fill`), e.g. the stage bars. */
  chartColor: string;
}

export const EVENT_TYPE_CONFIG: Record<TimelineEventType, EventTypeConfig> = {
  interview: {
    value: "interview",
    get label() {
      return word("timeline.eventType.interview");
    },
    icon: Users,
    get hint() {
      return word("timeline.eventTypeHint.interview");
    },
    badgeClass: "bg-info/15 text-info",
    tileClass: "bg-info/15 text-info ring-info/25",
    dotClass: "bg-info",
    selectedClass: "border-info/50 bg-info/10 text-foreground",
    chartColor: "var(--info)",
  },
  offer: {
    value: "offer",
    get label() {
      return word("timeline.eventType.offer");
    },
    icon: BadgeCheck,
    get hint() {
      return word("timeline.eventTypeHint.offer");
    },
    badgeClass: "bg-success/15 text-success",
    tileClass: "bg-success/15 text-success ring-success/25",
    dotClass: "bg-success",
    selectedClass: "border-success/50 bg-success/10 text-foreground",
    chartColor: "var(--success)",
  },
  denied: {
    value: "denied",
    get label() {
      return word("timeline.eventType.denied");
    },
    icon: CircleX,
    get hint() {
      return word("timeline.eventTypeHint.denied");
    },
    badgeClass: "bg-destructive/15 text-destructive",
    tileClass: "bg-destructive/15 text-destructive ring-destructive/25",
    dotClass: "bg-destructive",
    selectedClass: "border-destructive/50 bg-destructive/10 text-foreground",
    chartColor: "var(--destructive)",
  },
};

/**
 * Entrance of a form group a type or outcome choice reveals. The group
 * unmounts on the way out, so there is no exit animation.
 */
export const REVEAL_CLASS =
  "animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none";

/** Ordered config list — drive the selector and any legend off this. */
export const EVENT_TYPE_OPTIONS: readonly EventTypeConfig[] =
  TIMELINE_EVENT_TYPES.map((type) => EVENT_TYPE_CONFIG[type]);

/**
 * The close dialog's chips (`TimelineEventForm purpose="close"`): None, Offer,
 * Denied — never Interview. None closes with no timeline event; its look is
 * the muted one the old outcome picker gave it. Offer and Denied keep their
 * event look, and the line under the chips says what closing with each does
 * (`FINALIZE_OUTCOME_COPY`, the old outcome picker's words).
 */
export const CLOSE_TYPE_OPTIONS: readonly EventTypeOption[] = [
  {
    value: "none",
    get label() {
      return FINALIZE_OUTCOME_COPY.none.label;
    },
    icon: CircleDashed,
    get hint() {
      return FINALIZE_OUTCOME_COPY.none.description;
    },
    tileClass: "bg-muted text-muted-foreground ring-border",
    selectedClass: "border-muted-foreground/40 bg-accent text-foreground",
  },
  closeOutcomeOption("offer"),
  closeOutcomeOption("denied"),
];

/**
 * Offer or Denied as a close chip: the event's look, its closing line as the
 * hint. The words are getters, read at render time, so they follow the
 * active language (a spread would freeze them at import).
 */
function closeOutcomeOption(type: "offer" | "denied"): EventTypeOption {
  const config = EVENT_TYPE_CONFIG[type];
  return {
    ...config,
    get label() {
      return config.label;
    },
    get hint() {
      return FINALIZE_OUTCOME_COPY[type].description;
    },
  };
}

/**
 * A `value -> label` record whose entries are getters, so a lookup reads the
 * active language at the moment it is made.
 */
function liveLabels<K extends string>(
  keys: readonly K[],
  read: (key: K) => string,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(out, key, { enumerable: true, get: () => read(key) });
  }
  return out;
}

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
      get label() {
        return word("timeline.interviewType.unknown");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.unknown");
      },
    },
    initial_screening: {
      value: "initial_screening",
      get label() {
        return word("timeline.interviewType.initial_screening");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.initial_screening");
      },
    },
    technical: {
      value: "technical",
      get label() {
        return word("timeline.interviewType.technical");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.technical");
      },
    },
    cultural: {
      value: "cultural",
      get label() {
        return word("timeline.interviewType.cultural");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.cultural");
      },
    },
    hiring_manager: {
      value: "hiring_manager",
      get label() {
        return word("timeline.interviewType.hiring_manager");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.hiring_manager");
      },
    },
    take_home: {
      value: "take_home",
      get label() {
        return word("timeline.interviewType.take_home");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.take_home");
      },
    },
    final: {
      value: "final",
      get label() {
        return word("timeline.interviewType.final");
      },
      get shortLabel() {
        return word("timeline.interviewTypeShort.final");
      },
    },
  };

/** Ordered interview type list — drive the select off this. */
export const INTERVIEW_TYPE_OPTIONS: readonly InterviewTypeConfig[] =
  INTERVIEW_TYPES.map((type) => INTERVIEW_TYPE_CONFIG[type]);

/** value -> label lookup for a saved interview type. */
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = liveLabels(
  INTERVIEW_TYPES,
  (type) => INTERVIEW_TYPE_CONFIG[type].label,
);

/** The default interview type for a new interview event. */
export const DEFAULT_INTERVIEW_TYPE: InterviewType = "unknown";

export interface DeniedReasonConfig {
  value: DeniedReason;
  /** Human label for the select and the card badge. The CLI prints the same. */
  label: string;
}

export const DENIED_REASON_CONFIG: Record<DeniedReason, DeniedReasonConfig> =
  Object.fromEntries(
    DENIED_REASONS.map((reason) => [
      reason,
      {
        value: reason,
        get label() {
          return word(`timeline.deniedReason.${reason}`);
        },
      },
    ]),
  ) as Record<DeniedReason, DeniedReasonConfig>;

/** Ordered denied reason list — drive the select off this. */
export const DENIED_REASON_OPTIONS: readonly DeniedReasonConfig[] =
  DENIED_REASONS.map((reason) => DENIED_REASON_CONFIG[reason]);

/** value -> label lookup for a saved denied reason. */
export const DENIED_REASON_LABELS: Record<DeniedReason, string> = liveLabels(
  DENIED_REASONS,
  (reason) => DENIED_REASON_CONFIG[reason].label,
);

/** The default reason for a new denied event and a denied close. */
export const DEFAULT_DENIED_REASON: DeniedReason = "unknown";

export interface SalaryPeriodOption extends SelectOption {
  value: SalaryPeriod;
  /** Compact suffix appended to an amount, e.g. `/yr`. */
  suffix: string;
}

/** Every salary period the API can return, with its label and amount suffix. */
export const SALARY_PERIOD_OPTIONS: readonly SalaryPeriodOption[] =
  SALARY_PERIODS.map((period) => ({
    value: period,
    get label() {
      return word(`timeline.salaryPeriod.${period}`);
    },
    get suffix() {
      return word(`timeline.salaryPeriodSuffix.${period}`);
    },
  }));

/** value -> label lookup for a saved salary period. */
export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = liveLabels(
  SALARY_PERIODS,
  (period) => word(`timeline.salaryPeriod.${period}`),
);

/** value -> amount suffix lookup, e.g. `hourly` -> `/hr`. */
export const SALARY_PERIOD_SUFFIXES: Record<SalaryPeriod, string> = liveLabels(
  SALARY_PERIODS,
  (period) => word(`timeline.salaryPeriodSuffix.${period}`),
);

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
 * Full stage label, e.g. "Interview - Technical", "Offer" (R-027: a spaced
 * hyphen, not the old "·", between the event type and the interview type).
 * Every shared user-facing surface reads this — the agenda pill, the header
 * agenda dropdown, agenda alerts, dashboard chart tooltips and timeline event
 * action names. The calendar file's UID keeps the OLD "·" text on purpose
 * (R-008, `legacyStageLabel` in `src/lib/calendar.ts`) so re-importing an
 * already-downloaded event still updates the same entry; only the file's
 * SUMMARY and file name follow this hyphenated label.
 */
export function stageLabel(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  const base = EVENT_TYPE_CONFIG[eventType].label;
  if (eventType !== "interview") return base;
  return `${base} - ${INTERVIEW_TYPE_LABELS[interviewType ?? DEFAULT_INTERVIEW_TYPE]}`;
}

/**
 * Compact stage label for a chart axis, e.g. "Screening", "Offer". Interview
 * stages drop the "Interview - " prefix; pair the axis with `stageLabel` in
 * the tooltip.
 */
export function stageShortLabel(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  if (eventType !== "interview") return EVENT_TYPE_CONFIG[eventType].label;
  return INTERVIEW_TYPE_CONFIG[interviewType ?? DEFAULT_INTERVIEW_TYPE]
    .shortLabel;
}
