/** Public surface for the application timeline components. */

export { EventTypeBadge } from "@/components/timeline/event-type-badge";
export { EventTypeSelector } from "@/components/timeline/event-type-selector";
export { InterviewTypeBadge } from "@/components/timeline/interview-type-badge";
export { InterviewTypeSelect } from "@/components/timeline/interview-type-select";
export { SalaryPeriodToggle } from "@/components/timeline/salary-period-toggle";
export { TimelineEventCard } from "@/components/timeline/timeline-event-card";
export { TimelineEventList } from "@/components/timeline/timeline-event-list";
export { TimelinePanel } from "@/components/timeline/timeline-panel";
export { TimelineEventDialog } from "@/components/timeline/timeline-event-dialog";
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
  DEFAULT_INTERVIEW_TYPE,
  EVENT_TYPE_CONFIG,
  EVENT_TYPE_OPTIONS,
  INTERVIEW_TYPE_CONFIG,
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPE_OPTIONS,
  OFFER_SALARY_PERIOD_OPTIONS,
  SALARY_PERIOD_LABELS,
  SALARY_PERIOD_OPTIONS,
  SALARY_PERIOD_SUFFIXES,
  TIMELINE_STAGES,
  stageLabel,
  stageShortLabel,
  type CurrencyOption,
  type EventTypeConfig,
  type InterviewTypeConfig,
  type SalaryPeriodOption,
  type TimelineStage,
} from "@/components/timeline/timeline-options";

export {
  INITIAL_SCREENING_TAKEN_HINT,
  INTERVIEW_TYPE_TAKEN_LABEL,
  LEGACY_HOURLY_OFFER_HINT,
  TIMELINE_READ_ONLY_COPY,
  type TimelineReadOnlyReason,
} from "@/components/timeline/timeline-copy";

export {
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  TIMELINE_EVENT_TYPES,
  type InterviewType,
  type OfferSalaryPeriod,
  type SalaryCurrency,
  type SalaryPeriod,
  type TimelineEventType,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
