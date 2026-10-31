/** Public surface for the application timeline components. */

export { DeniedReasonBadge } from "@/components/timeline/denied-reason-badge";
export { DeniedReasonSelect } from "@/components/timeline/denied-reason-select";
export { EventTypeBadge } from "@/components/timeline/event-type-badge";
export { EventTypeSelector } from "@/components/timeline/event-type-selector";
export { InterviewTypeBadge } from "@/components/timeline/interview-type-badge";
export { InterviewTypeSelect } from "@/components/timeline/interview-type-select";
export { SalaryPeriodToggle } from "@/components/timeline/salary-period-toggle";
export { TimelineEventCard } from "@/components/timeline/timeline-event-card";
export { TimelineEventList } from "@/components/timeline/timeline-event-list";
export { TimelinePanel } from "@/components/timeline/timeline-panel";
export { TimelineEventDialog } from "@/components/timeline/timeline-event-dialog";
export { TimezoneSelect } from "@/components/timeline/timezone-select";
export {
  TimelineEventFormFields,
  type TimelineEventFormFieldsProps,
} from "@/components/timeline/timeline-event-form-fields";

export {
  formatEventDate,
  formatOfferSalary,
  formatTimeRange,
} from "@/components/timeline/timeline-format";

export {
  CURRENCY_OPTIONS,
  DEFAULT_DENIED_REASON,
  DEFAULT_INTERVIEW_TYPE,
  DENIED_REASON_CONFIG,
  DENIED_REASON_LABELS,
  DENIED_REASON_OPTIONS,
  EVENT_TYPE_CONFIG,
  EVENT_TYPE_OPTIONS,
  INTERVIEW_TYPE_CONFIG,
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPE_OPTIONS,
  OFFER_SALARY_PERIOD_OPTIONS,
  REVEAL_CLASS,
  SALARY_PERIOD_LABELS,
  SALARY_PERIOD_OPTIONS,
  SALARY_PERIOD_SUFFIXES,
  TIMELINE_STAGES,
  stageLabel,
  stageShortLabel,
  type CurrencyOption,
  type DeniedReasonConfig,
  type EventTypeConfig,
  type InterviewTypeConfig,
  type SalaryPeriodOption,
  type TimelineStage,
} from "@/components/timeline/timeline-options";

export {
  SCHEDULE_COPY,
  TIMELINE_COPY,
  TIMELINE_READ_ONLY_COPY,
  TIMEZONE_COPY,
  type TimelineReadOnlyReason,
} from "@/components/timeline/timeline-copy";

export {
  browserTimeZone,
  FALLBACK_TIME_ZONE,
  groupTimeZones,
  supportedTimeZones,
  timeZoneLabel,
  timeZoneOffset,
  type TimeZoneGroup,
  type TimeZoneOption,
} from "@/components/timeline/timezone-options";

export {
  DENIED_REASONS,
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  TIMELINE_EVENT_TYPES,
  type DeniedReason,
  type InterviewType,
  type OfferSalaryPeriod,
  type SalaryCurrency,
  type SalaryPeriod,
  type TimelineEventType,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
