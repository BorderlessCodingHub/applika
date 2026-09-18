import { type ReactNode } from "react";
import { CalendarClock, Coins } from "lucide-react";

import { SCHEDULE_COPY } from "@/components/timeline/timeline-copy";
import { REVEAL_CLASS } from "@/components/timeline/timeline-options";
import { cn } from "@/lib/utils";

/**
 * Named slots for the add/edit timeline-event form. Each slot expects a single
 * ready-to-render field (typically a `FormField` wrapping the matching control).
 * See the note on each prop for the API field + suggested control.
 */
export interface TimelineEventFormFieldsProps {
  /** `event_type` — drop the `EventTypeSelector` (in a `FormField`) here. */
  typeField: ReactNode;
  /** `interview_type` — `InterviewTypeSelect`. Interview only. */
  interviewTypeField: ReactNode;
  /** `denied_reason` — `DeniedReasonSelect`. Denied only. */
  deniedReasonField?: ReactNode;
  /** `event_date` (required) — `DatePickerInput`, never `<input type="date">`. */
  eventDateField: ReactNode;
  /** `start_time` (optional) — time `Input`. Interview only. */
  startTimeField: ReactNode;
  /** `end_time` (optional) — time `Input`. Interview only. */
  endTimeField: ReactNode;
  /** `timezone` — `TimezoneSelect`, pre-filled with the browser's zone. Interview only. */
  timezoneField: ReactNode;
  /** `observation` (optional) — `Textarea`. */
  observationField: ReactNode;
  /** `salary_period` — `SalaryPeriodToggle`. Offer only. */
  salaryPeriodField: ReactNode;
  /** `salary_amount` — numeric `Input`. Offer only. */
  salaryAmountField: ReactNode;
  /** `salary_currency` — currency `Select` of `CURRENCY_OPTIONS`. Offer only. */
  salaryCurrencyField: ReactNode;
  /**
   * Reveals the interview type field right under the type selector AND the
   * schedule group (start, end, timezone). Drive it from
   * `useWatch({ name: "event_type" }) === "interview"`. When false, all four
   * fields are unmounted (and must be omitted from the payload).
   */
  isInterview: boolean;
  /**
   * Reveals the required Offer salary group. Drive it from
   * `useWatch({ name: "event_type" }) === "offer"`. When false, the three salary
   * fields are unmounted (and must be omitted from the payload).
   */
  isOffer: boolean;
  /**
   * Reveals the denied reason field right under the type selector. Drive it
   * from `useWatch({ name: "event_type" }) === "denied"`. When false, the field
   * is unmounted (and `denied_reason` must be omitted from the payload).
   */
  isDenied?: boolean;
  className?: string;
}

/**
 * Presentational layout scaffold for the timeline event form. Orders the fields
 * — type selector, the type's own classifier (interview type or denied reason),
 * required date, the interview-only schedule group, the Offer salary group,
 * then notes — and exposes one slot per field so the frontend-engineer drops
 * react-hook-form-controlled `FormField`s in without this component owning any
 * value/onChange/validation.
 *
 * Intentionally NOT a controlled form: no `react-hook-form`, no `<form>`, no
 * submit. Wrap it in your own `<form>` (inside `TimelineEventDialog`) and place
 * the submit action in the dialog footer. The `isInterview` / `isOffer` /
 * `isDenied` flags are the only state this reads — pass the watched
 * `event_type`. A hidden group is unmounted, never CSS-hidden, so it leaves the
 * tab order and the accessibility tree with it.
 */
export function TimelineEventFormFields({
  typeField,
  interviewTypeField,
  deniedReasonField,
  eventDateField,
  startTimeField,
  endTimeField,
  timezoneField,
  observationField,
  salaryPeriodField,
  salaryAmountField,
  salaryCurrencyField,
  isInterview,
  isOffer,
  isDenied = false,
  className,
}: TimelineEventFormFieldsProps) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {typeField}

      {isInterview ? (
        <div
          className={cn(
            REVEAL_CLASS,
            "rounded-md border border-info/30 bg-info/5 p-3",
          )}
        >
          {interviewTypeField}
        </div>
      ) : null}

      {isDenied && deniedReasonField ? (
        <div
          className={cn(
            REVEAL_CLASS,
            "rounded-md border border-destructive/30 bg-destructive/5 p-3",
          )}
        >
          {deniedReasonField}
        </div>
      ) : null}

      {eventDateField}

      {isInterview ? (
        <fieldset
          className={cn(
            REVEAL_CLASS,
            "min-w-0 rounded-md border border-border p-3",
          )}
        >
          <legend className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wide-label text-muted-foreground uppercase">
            <CalendarClock aria-hidden className="size-3" />
            {SCHEDULE_COPY.legend}
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            {SCHEDULE_COPY.hint}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {startTimeField}
            {endTimeField}
            <div className="col-span-2 min-w-0">{timezoneField}</div>
          </div>
        </fieldset>
      ) : null}

      {isOffer ? (
        <fieldset
          className={cn(
            REVEAL_CLASS,
            "min-w-0 rounded-md border border-success/30 bg-success/5 p-3",
          )}
        >
          <legend className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wide-label text-success uppercase">
            <Coins aria-hidden className="size-3" />
            Offer details
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Required for offers — record the compensation that was extended.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">{salaryPeriodField}</div>
            {salaryAmountField}
            <div className="sm:col-span-2">{salaryCurrencyField}</div>
          </div>
        </fieldset>
      ) : null}

      {observationField}
    </div>
  );
}
