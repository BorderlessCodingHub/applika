"use client";

import { useId, type ComponentType, type ReactNode } from "react";
import {
  CalendarCheck,
  CircleDashed,
  Coins,
  type LucideProps,
} from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import {
  FINALIZE_FIELDS_COPY,
  FINALIZE_OUTCOME_COPY,
  FINALIZE_OUTCOMES,
  type FinalizeOutcome,
} from "@/components/applications/application-close-copy";
import { EVENT_TYPE_CONFIG } from "@/components/timeline/timeline-options";
import { cn } from "@/lib/utils";

interface OutcomeLook {
  icon: ComponentType<LucideProps>;
  tileClass: string;
  selectedClass: string;
}

// Offer and denied borrow the timeline's look: the outcome IS that event.
const OUTCOME_LOOK: Record<FinalizeOutcome, OutcomeLook> = {
  none: {
    icon: CircleDashed,
    tileClass: "bg-muted text-muted-foreground ring-border",
    selectedClass: "border-muted-foreground/40 bg-accent text-foreground",
  },
  offer: EVENT_TYPE_CONFIG.offer,
  denied: EVENT_TYPE_CONFIG.denied,
};

interface FinalizeOutcomePickerProps {
  /** Currently selected outcome. Defaults to `none` in the form. */
  value: FinalizeOutcome;
  /** Fired with the newly selected outcome. */
  onValueChange: (value: FinalizeOutcome) => void;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  /** Hint/error ids; `<FormControl>` passes these through. */
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Three-way, icon-led picker for the closing outcome: None, Offer or Denied.
 * Built on Radix `RadioGroup` like `EventTypeSelector` — arrow keys move the
 * selection, each chip is a labelled `radio`. The line under the chips explains
 * the selected outcome and is wired as the group's description. Controlled +
 * presentational.
 */
export function FinalizeOutcomePicker({
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: FinalizeOutcomePickerProps) {
  const descriptionId = useId();
  const describedBy = [ariaDescribedby, descriptionId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <RadioGroupPrimitive.Root
        id={id}
        value={value}
        onValueChange={(next) => onValueChange(next as FinalizeOutcome)}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledby}
        aria-describedby={describedBy}
        aria-label={
          ariaLabelledby ? undefined : FINALIZE_FIELDS_COPY.outcomeLabel
        }
        className="grid grid-cols-3 gap-2"
      >
        {FINALIZE_OUTCOMES.map((outcome) => {
          const {
            icon: Icon,
            tileClass,
            selectedClass,
          } = OUTCOME_LOOK[outcome];
          const selected = value === outcome;
          return (
            <RadioGroupPrimitive.Item
              key={outcome}
              value={outcome}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? selectedClass
                  : "border-border text-muted-foreground hover:border-border-strong hover:bg-accent/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-9 items-center justify-center rounded-md ring-1",
                  tileClass,
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <span className="text-xs font-medium">
                {FINALIZE_OUTCOME_COPY[outcome].label}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
      <p id={descriptionId} className="text-xs text-muted-foreground">
        {FINALIZE_OUTCOME_COPY[value].description}
      </p>
    </div>
  );
}

/**
 * Named slots for the finalize (close) form body. Each slot expects a single
 * ready-to-render field, typically a `FormField` wrapping its control.
 */
export interface FinalizeOutcomeFieldsProps {
  /** `outcome` — `FinalizeOutcomePicker` in a `FormField`. */
  outcomeField: ReactNode;
  /** `event_date` — `DatePickerInput` (today by default, no future). Offer/denied only. */
  eventDateField: ReactNode;
  /** `observation` — `Textarea`. Offer/denied only. */
  observationField: ReactNode;
  /** `salary_amount` — numeric `Input`. Offer only. */
  salaryAmountField: ReactNode;
  /** `salary_currency` — `Select` of the 20 `CURRENCY_OPTIONS`. Offer only. */
  salaryCurrencyField: ReactNode;
  /** `salary_period` — `SalaryPeriodToggle` (monthly | annually). Offer only. */
  salaryPeriodField: ReactNode;
  /**
   * The watched outcome. `offer`/`denied` reveal the date and observation;
   * `offer` also reveals the salary group. Unrevealed fields are unmounted and
   * must be omitted from the payload (`none` sends no body at all).
   */
  outcome: FinalizeOutcome;
  className?: string;
}

/**
 * Presentational layout scaffold for the finalize dialog body: the outcome
 * picker, then — for Offer or Denied — the date and observation, then — for
 * Offer only — the salary triad, grouped like the timeline form's Offer
 * details. Not a form: no `<form>`, no submit, no validation. The dialog's
 * description carries `FINALIZE_REVERSIBLE_COPY`.
 */
export function FinalizeOutcomeFields({
  outcomeField,
  eventDateField,
  observationField,
  salaryAmountField,
  salaryCurrencyField,
  salaryPeriodField,
  outcome,
  className,
}: FinalizeOutcomeFieldsProps) {
  const hasOutcome = outcome !== "none";
  const isOffer = outcome === "offer";

  return (
    <div className={cn("space-y-5", className)}>
      {outcomeField}

      {hasOutcome ? (
        <fieldset className="rounded-md border border-border p-3">
          <legend className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wide-label text-muted-foreground uppercase">
            <CalendarCheck aria-hidden className="size-3" />
            {FINALIZE_FIELDS_COPY.detailsLegend}
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            {FINALIZE_FIELDS_COPY.detailsHint}
          </p>
          <div className="space-y-4">
            {eventDateField}
            {observationField}
          </div>
        </fieldset>
      ) : null}

      {isOffer ? (
        <fieldset className="rounded-md border border-success/30 bg-success/5 p-3">
          <legend className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wide-label text-success uppercase">
            <Coins aria-hidden className="size-3" />
            {FINALIZE_FIELDS_COPY.offerLegend}
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            {FINALIZE_FIELDS_COPY.offerHint}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">{salaryPeriodField}</div>
            {salaryAmountField}
            <div className="sm:col-span-2">{salaryCurrencyField}</div>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
