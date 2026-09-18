"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { LEGACY_HOURLY_OFFER_HINT } from "@/components/timeline/timeline-copy";
import { EventTypeSelector } from "@/components/timeline/event-type-selector";
import { InterviewTypeSelect } from "@/components/timeline/interview-type-select";
import {
  CURRENCY_OPTIONS,
  DEFAULT_INTERVIEW_TYPE,
} from "@/components/timeline/timeline-options";
import { SalaryPeriodToggle } from "@/components/timeline/salary-period-toggle";
import { TimelineEventDialog } from "@/components/timeline/timeline-event-dialog";
import { TimelineEventFormFields } from "@/components/timeline/timeline-event-form-fields";
import {
  emptyTimelineEventValues,
  timelineEventSchema,
  timelineEventToFormValues,
  toTimelineEventPayload,
  type TimelineEventFormValues,
} from "@/components/timeline/timeline-event-schema";
import {
  type InterviewType,
  type OfferSalaryPeriod,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormDescription,
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
import { useCreateTimelineEvent } from "@/hooks/use-create-timeline-event";
import { useUpdateTimelineEvent } from "@/hooks/use-update-timeline-event";
import { getApiError } from "@/lib/api-client";

const FORM_ID = "timeline-event-form";

interface TimelineEventFormProps {
  /** Application the event belongs to. */
  applicationId: string;
  /** Controlled dialog open state. */
  open: boolean;
  /** Controlled open-change handler. */
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this event; when null/undefined it creates one. */
  event?: TimelineEventView | null;
  /**
   * The application's OTHER events (every event but the one being edited),
   * used to enforce R-030: `initial_screening` is disabled in the interview
   * type select once the application already has one.
   */
  otherEvents: TimelineEventView[];
}

/**
 * Wired add/edit timeline-event dialog (PRD 0008, ADR 0012). Owns the
 * react-hook-form control (zod discriminated union keyed on `event_type`), the
 * create/update mutation, and the toasts. Drops one controlled `FormField` into
 * each `TimelineEventFormFields` slot; the interview type group is revealed by
 * the watched `event_type === "interview"` and the Offer salary group by
 * `event_type === "offer"` — each group's fields are only sent for their type.
 *
 * Ported from mynextjob's `timeline-event-form.tsx` (which has no interview
 * types — R-030/R-032 and the `interview_type` field are applika additions on
 * top of the port, per the PRD's "idk if this exists in mynextjob" note).
 */
export function TimelineEventForm({
  applicationId,
  open,
  onOpenChange,
  event,
  otherEvents,
}: TimelineEventFormProps) {
  const mode = event ? "edit" : "create";
  const createEvent = useCreateTimelineEvent();
  const updateEvent = useUpdateTimelineEvent();

  const defaults = useMemo<TimelineEventFormValues>(
    () =>
      event ? timelineEventToFormValues(event) : emptyTimelineEventValues(),
    [event],
  );

  const form = useForm<TimelineEventFormValues>({
    resolver: zodResolver(timelineEventSchema),
    defaultValues: defaults,
  });

  // Re-seed the form each time the dialog opens (or the edited event changes) so
  // a reused dialog instance never carries stale values between opens.
  useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const isSaving = createEvent.isPending || updateEvent.isPending;
  const eventType = useWatch({ control: form.control, name: "event_type" });
  const isInterview = eventType === "interview";
  const isOffer = eventType === "offer";

  // The interview type select shows "Unknown" the moment event_type becomes
  // "interview" (the display falls back to DEFAULT_INTERVIEW_TYPE when the
  // field is blank — see InterviewTypeSelect), but nothing writes that default
  // back into form state until the user actually touches the select. Seed it
  // explicitly so a save with the select left untouched still carries a valid
  // "unknown" rather than failing validation on a blank value.
  useEffect(() => {
    if (isInterview && !form.getValues("interview_type")) {
      form.setValue("interview_type", DEFAULT_INTERVIEW_TYPE, {
        shouldValidate: false,
      });
    }
  }, [isInterview, form]);

  // R-030: at most one initial-screening interview per application. The other
  // events (this one excluded) decide whether the option is disabled.
  const hasOtherInitialScreening = otherEvents.some(
    (other) =>
      other.type === "interview" && other.interviewType === "initial_screening",
  );
  const interviewTypeDisabledValues = hasOtherInitialScreening
    ? (["initial_screening"] as const)
    : [];

  // A legacy offer recorded per hour has no monthly/annually selection: the
  // toggle then shows nothing selected and the zod enum blocks save.
  const isLegacyHourlyOffer =
    mode === "edit" &&
    event?.type === "offer" &&
    event.salaryPeriod === "hourly";

  const onInvalid = () => {
    toast.error("Please fix the highlighted fields before saving");
  };

  const onValid = (values: TimelineEventFormValues) => {
    const payload = toTimelineEventPayload(values);

    if (mode === "create") {
      createEvent.mutate(
        { applicationId, payload },
        {
          onSuccess: () => {
            toast.success("Event added");
            onOpenChange(false);
          },
          onError: (error) => {
            toast.error(
              isAxiosError(error)
                ? getApiError(error)
                : "Could not add the event",
            );
          },
        },
      );
      return;
    }

    updateEvent.mutate(
      { applicationId, eventId: event!.id, payload },
      {
        onSuccess: () => {
          toast.success("Event updated");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(
            isAxiosError(error)
              ? getApiError(error)
              : "Could not update the event",
          );
        },
      },
    );
  };

  const onSubmit = form.handleSubmit(onValid, onInvalid);

  return (
    <TimelineEventDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              <>
                <Save aria-hidden />
                {mode === "create" ? "Add event" : "Save changes"}
              </>
            )}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={onSubmit} noValidate>
          <TimelineEventFormFields
            isInterview={isInterview}
            isOffer={isOffer}
            typeField={
              <FormField
                control={form.control}
                name="event_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event type</FormLabel>
                    <FormControl>
                      <EventTypeSelector
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSaving}
                        aria-invalid={Boolean(form.formState.errors.event_type)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            }
            interviewTypeField={
              <FormField
                control={form.control}
                name="interview_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interview type</FormLabel>
                    <FormControl>
                      <InterviewTypeSelect
                        value={
                          (field.value as InterviewType) ||
                          DEFAULT_INTERVIEW_TYPE
                        }
                        onValueChange={field.onChange}
                        disabledValues={interviewTypeDisabledValues}
                        disabled={isSaving}
                        aria-invalid={Boolean(
                          form.formState.errors.interview_type,
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
                        disabled={isSaving}
                        aria-invalid={Boolean(form.formState.errors.event_date)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            }
            startTimeField={
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={isSaving} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            }
            endTimeField={
              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={isSaving} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            }
            timezoneField={
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Europe/London"
                        disabled={isSaving}
                        {...field}
                      />
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
                        value={(field.value as OfferSalaryPeriod | "") ?? ""}
                        onValueChange={field.onChange}
                        disabled={isSaving}
                        aria-invalid={Boolean(
                          form.formState.errors.salary_period,
                        )}
                      />
                    </FormControl>
                    {isLegacyHourlyOffer ? (
                      <FormDescription>
                        {LEGACY_HOURLY_OFFER_HINT}
                      </FormDescription>
                    ) : null}
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
                        value={field.value ?? ""}
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
                      value={field.value ?? ""}
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
            observationField={
              <FormField
                control={form.control}
                name="observation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Anything you want to remember…"
                        disabled={isSaving}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            }
          />
        </form>
      </Form>
    </TimelineEventDialog>
  );
}
