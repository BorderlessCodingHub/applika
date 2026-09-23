"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { format } from "date-fns";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  DEFAULT_FINALIZE_OUTCOME,
  FINALIZE_DIALOG_COPY,
  FINALIZE_REVERSIBLE_COPY,
  FINALIZE_OUTCOMES,
  type FinalizeOutcome,
} from "@/components/applications/application-close-copy";
import {
  FinalizeOutcomeFields,
  FinalizeOutcomePicker,
} from "@/components/applications/finalize-outcome-fields";
import { DeniedReasonSelect } from "@/components/timeline/denied-reason-select";
import { SalaryPeriodToggle } from "@/components/timeline/salary-period-toggle";
import {
  DEFAULT_DENIED_REASON,
  CURRENCY_OPTIONS,
} from "@/components/timeline/timeline-options";
import { DENIED_REASON_FIELD_LABEL } from "@/components/timeline/timeline-copy";
import {
  DENIED_REASONS,
  type DeniedReason,
  type OfferSalaryPeriod,
} from "@/components/timeline/timeline-types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFinalizeApplication } from "@/hooks/use-finalize-application";
import { getApiError } from "@/lib/api-client";
import type { FinalizeApplicationPayload } from "@/services/types/applications";

const OFFER_SALARY_PERIOD_VALUES = ["monthly", "annually"] as const;

/**
 * Mirrors `FinalizeWithOutcome`'s limits exactly
 * (`backend/app/presentation/schemas/application.py`): `observation` <= 5000,
 * `salary_amount` up to 10 integer digits and 2 decimal places
 * (`max_digits=12, decimal_places=2`) — same ceilings as the timeline event
 * form's offer branch, so a 422 is unreachable here too.
 */
const MAX_OBSERVATION = 5000;
const SALARY_AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Close-application form schema (PRD 0008, ADR 0012, R-032 — supersedes the
 * plan's original confirm-only finalize). `outcome` gates everything else:
 * `none` needs nothing (a bodyless POST); `offer`/`denied` need a date; `offer`
 * additionally needs the salary triad restricted to `monthly | annually`.
 */
const finalizeSchema = z
  .object({
    outcome: z.enum(FINALIZE_OUTCOMES),
    event_date: z.string(),
    observation: z.string(),
    salary_amount: z.string(),
    salary_currency: z.string(),
    salary_period: z.string(),
    denied_reason: z.string(),
  })
  .superRefine((values, ctx) => {
    // `none` unmounts every field below (FinalizeOutcomeFields), so nothing
    // here may fail against a value the user can no longer see or fix — a
    // stale >5000-char note typed while Denied/Offer was selected, then left
    // behind after switching back to None, must not silently block the close.
    if (values.outcome === "none") return;

    if (!values.event_date.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["event_date"],
        message: "Date is required",
      });
    }

    if (values.observation.length > MAX_OBSERVATION) {
      ctx.addIssue({
        code: "custom",
        path: ["observation"],
        message: "Notes are too long",
      });
    }

    if (
      values.outcome === "denied" &&
      !DENIED_REASONS.includes(values.denied_reason as DeniedReason)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["denied_reason"],
        message: "Select a reason",
      });
    }

    if (values.outcome !== "offer") return;

    if (
      values.salary_period !== "monthly" &&
      values.salary_period !== "annually"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_period"],
        message: "Select a salary period",
      });
    }
    const amount = values.salary_amount.trim();
    if (!amount) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_amount"],
        message: "Enter the offered amount",
      });
    } else if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_amount"],
        message: "Enter a valid, non-negative number",
      });
    } else if (!SALARY_AMOUNT_PATTERN.test(amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_amount"],
        message: "Up to 10 digits and 2 decimal places",
      });
    }
    if (!values.salary_currency) {
      ctx.addIssue({
        code: "custom",
        path: ["salary_currency"],
        message: "Select a currency",
      });
    }
  });

type FinalizeFormValues = z.infer<typeof finalizeSchema>;

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function defaultFinalizeValues(): FinalizeFormValues {
  return {
    outcome: DEFAULT_FINALIZE_OUTCOME,
    event_date: todayIso(),
    observation: "",
    salary_amount: "",
    salary_currency: "",
    salary_period: "",
    denied_reason: DEFAULT_DENIED_REASON,
  };
}

/**
 * Convert validated form values into the finalize body. `none` sends
 * `undefined` — a bodyless POST — everything else sends only the fields its
 * outcome uses (R-032).
 */
export function toFinalizePayload(
  values: FinalizeFormValues,
): FinalizeApplicationPayload | undefined {
  if (values.outcome === "none") return undefined;

  const base = {
    outcome: values.outcome,
    event_date: values.event_date,
    observation: values.observation.trim() || undefined,
  };

  if (values.outcome === "offer") {
    return {
      ...base,
      outcome: "offer",
      salary_amount: values.salary_amount.trim(),
      salary_currency:
        values.salary_currency as FinalizeApplicationPayload["salary_currency"],
      salary_period: values.salary_period as OfferSalaryPeriod,
    };
  }

  return {
    ...base,
    outcome: "denied",
    denied_reason: values.denied_reason as DeniedReason,
  };
}

interface FinalizeDialogProps {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Close-application dialog (PRD 0008, ADR 0012). Superseded from the plan's
 * confirm-only finalize by the owner's 2026-09-18 decision (R-032): the user
 * picks an outcome — None, Offer or Denied — and the dialog reveals only the
 * fields that outcome needs. Closing is always reversible (the copy says so,
 * and `useReopenApplication` proves it) — this is deliberately NOT the old
 * "irreversible" alert-triangle warning.
 */
export function FinalizeDialog({
  applicationId,
  open,
  onOpenChange,
}: FinalizeDialogProps) {
  const finalizeApplication = useFinalizeApplication();

  const form = useForm<FinalizeFormValues>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: defaultFinalizeValues(),
  });

  useEffect(() => {
    if (open) form.reset(defaultFinalizeValues());
  }, [open, form]);

  const outcome = useWatch({ control: form.control, name: "outcome" });
  const isSaving = finalizeApplication.isPending;

  const onInvalid = () => {
    toast.error("Please fix the highlighted fields before closing");
  };

  const onValid = (values: FinalizeFormValues) => {
    finalizeApplication.mutate(
      { applicationId, payload: toFinalizePayload(values) },
      {
        onSuccess: () => {
          toast.success("Application closed");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(
            isAxiosError(error) ? getApiError(error) : "Could not close it",
          );
        },
      },
    );
  };

  const onSubmit = form.handleSubmit(onValid, onInvalid);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{FINALIZE_DIALOG_COPY.title}</AlertDialogTitle>
          <AlertDialogDescription className="flex items-start gap-2">
            <RotateCcw
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>{FINALIZE_REVERSIBLE_COPY}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="mt-2">
            <FinalizeOutcomeFields
              outcome={outcome as FinalizeOutcome}
              outcomeField={
                <FormField
                  control={form.control}
                  name="outcome"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <FinalizeOutcomePicker
                          value={field.value as FinalizeOutcome}
                          onValueChange={field.onChange}
                          disabled={isSaving}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              deniedReasonField={
                <FormField
                  control={form.control}
                  name="denied_reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{DENIED_REASON_FIELD_LABEL}</FormLabel>
                      <FormControl>
                        <DeniedReasonSelect
                          value={
                            (field.value as DeniedReason) ||
                            DEFAULT_DENIED_REASON
                          }
                          onValueChange={field.onChange}
                          disabled={isSaving}
                          aria-invalid={Boolean(
                            form.formState.errors.denied_reason,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              eventDateField={
                <FormField
                  control={form.control}
                  name="event_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <DatePickerInput
                          value={field.value}
                          onChange={(date) => field.onChange(date ?? "")}
                          maxDate={new Date()}
                          disabled={isSaving}
                          aria-invalid={Boolean(
                            form.formState.errors.event_date,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              observationField={
                <FormField
                  control={form.control}
                  name="observation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} disabled={isSaving} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              salaryPeriodField={
                <FormField
                  control={form.control}
                  name="salary_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary period</FormLabel>
                      <FormControl>
                        <SalaryPeriodToggle
                          value={
                            OFFER_SALARY_PERIOD_VALUES.includes(
                              field.value as (typeof OFFER_SALARY_PERIOD_VALUES)[number],
                            )
                              ? (field.value as OfferSalaryPeriod)
                              : ""
                          }
                          onValueChange={field.onChange}
                          disabled={isSaving}
                          aria-invalid={Boolean(
                            form.formState.errors.salary_period,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              salaryAmountField={
                <FormField
                  control={form.control}
                  name="salary_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="160000"
                          disabled={isSaving}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              salaryCurrencyField={
                <FormField
                  control={form.control}
                  name="salary_currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSaving}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
            />

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
              >
                {FINALIZE_DIALOG_COPY.cancel}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Save aria-hidden />
                )}
                {FINALIZE_DIALOG_COPY.submit}
              </Button>
            </div>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
