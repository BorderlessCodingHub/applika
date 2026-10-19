"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { FINALIZE_DIALOG_COPY } from "@/components/applications/application-close-copy";
import {
  DENIED_REASON_FIELD_LABEL,
  LEGACY_HOURLY_OFFER_HINT,
  TIMEZONE_COPY,
} from "@/components/timeline/timeline-copy";
import { DeniedReasonSelect } from "@/components/timeline/denied-reason-select";
import { EventTypeSelector } from "@/components/timeline/event-type-selector";
import { InterviewTypeSelect } from "@/components/timeline/interview-type-select";
import {
  CLOSE_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  DEFAULT_DENIED_REASON,
  DEFAULT_INTERVIEW_TYPE,
} from "@/components/timeline/timeline-options";
import { SalaryPeriodToggle } from "@/components/timeline/salary-period-toggle";
import { TimelineEventDialog } from "@/components/timeline/timeline-event-dialog";
import { TimelineEventFormFields } from "@/components/timeline/timeline-event-form-fields";
import {
  emptyCloseValues,
  emptyTimelineEventValues,
  timelineEventSchema,
  timelineEventToFormValues,
  toFinalizeOutcomePayload,
  toTimelineEventPayload,
  type TimelineEventCloseValues,
  type TimelineEventFormValues,
} from "@/components/timeline/timeline-event-schema";
import {
  type DeniedReason,
  type InterviewType,
  type OfferSalaryPeriod,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
import { TimezoneSelect } from "@/components/timeline/timezone-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useFinalizeApplication } from "@/hooks/use-finalize-application";
import { useUpdateTimelineEvent } from "@/hooks/use-update-timeline-event";
import { getApiError } from "@/lib/api-client";

const FORM_ID = "timeline-event-form";

/**
 * Why the dialog opened: `event` is Add event (no `event`) or Edit event (an
 * `event`); `close` is the flag on an application row — close the
 * application, with no outcome (None) or with an Offer or Denied event.
 */
export type TimelineEventFormPurpose = "event" | "close";

/** What the dialog is doing, derived from `purpose` and `event`. */
export type TimelineEventFormMode = "create" | "edit" | "close";

export interface TimelineEventFormProps {
  /** Application the event belongs to. */
  applicationId: string;
  /** Controlled dialog open state. */
  open: boolean;
  /** Controlled open-change handler. */
  onOpenChange: (open: boolean) => void;
  /**
   * `"event"` (default): Add event or Edit event. `"close"`: the close
   * dialog — None, Offer and Denied (never Interview), opens on None, and
   * saving always closes the application through
   * `POST /applications/{id}/finalize`. `event` is ignored when closing.
   */
  purpose?: TimelineEventFormPurpose;
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
 * The one timeline-event dialog (PRD 0008, ADR 0012, PRD 0016): Add event,
 * Edit event, and the flag's Close application. Owns the react-hook-form
 * control (zod discriminated union keyed on `event_type`), the create/update/
 * finalize mutation, and the toasts. Drops one controlled `FormField` into
 * each `TimelineEventFormFields` slot; the interview type group is revealed by
 * the watched `event_type === "interview"` and the Offer salary group by
 * `event_type === "offer"` — each group's fields are only sent for their type.
 *
 * Close mode (`purpose="close"`) offers None, Offer and Denied with the line
 * under the chips explaining the pick, opens on None, and shows no checkbox:
 * it always closes. None shows no other field and sends a bodyless finalize;
 * Offer or Denied send the outcome body (`toFinalizeOutcomePayload`), which
 * records the event and closes in one commit. A save that closes caps the
 * date at today.
 *
 * Add event with an Offer or Denied shows the "Close the application" box in
 * the footer, before Cancel, ticked on every open. Ticked, the save is that
 * same one finalize request; unticked (or an Interview, which never shows
 * the box), it is `POST /applications/{id}/timeline` as before. The box
 * lives in the footer, outside the `<form>`, so `<Form>` wraps the whole
 * dialog. Edit event shows no box and never closes.
 *
 * R-030/R-032 and the `interview_type` field sit on top of the base event
 * form.
 */
export function TimelineEventForm({
  applicationId,
  open,
  onOpenChange,
  purpose = "event",
  event,
  otherEvents,
}: TimelineEventFormProps) {
  const mode: TimelineEventFormMode =
    purpose === "close" ? "close" : event ? "edit" : "create";
  const createEvent = useCreateTimelineEvent();
  const updateEvent = useUpdateTimelineEvent();
  const finalizeApplication = useFinalizeApplication();

  const defaults = useMemo<TimelineEventFormValues>(
    () =>
      mode === "close"
        ? emptyCloseValues()
        : event
          ? timelineEventToFormValues(event)
          : emptyTimelineEventValues(),
    [mode, event],
  );

  const form = useForm<TimelineEventFormValues>({
    resolver: zodResolver(timelineEventSchema),
    defaultValues: defaults,
  });

  // Re-seed the form each time the dialog opens (or the edited event changes) so
  // a reused dialog instance never carries stale values between opens. The
  // close dialog reseeds fresh values (today's date) on every open, so it
  // always opens on None.
  useEffect(() => {
    if (!open) return;
    form.reset(mode === "close" ? emptyCloseValues() : defaults);
  }, [open, mode, defaults, form]);

  const isSaving =
    createEvent.isPending ||
    updateEvent.isPending ||
    finalizeApplication.isPending;
  const eventType = useWatch({ control: form.control, name: "event_type" });
  const closeApplication = useWatch({
    control: form.control,
    name: "close_application",
  });
  const isNone = eventType === "none";
  const isInterview = eventType === "interview";
  const isOffer = eventType === "offer";
  const isDenied = eventType === "denied";
  // Saving closes the application: always in the close dialog, and for an
  // Offer or Denied whose `close_application` is set. Closing with an event
  // records a day that already happened, so its date stops at today.
  const showsCloseBox = mode === "create" && (isOffer || isDenied);
  const closesWithEvent =
    (isOffer || isDenied) &&
    (mode === "close" || (mode === "create" && closeApplication));
  const isClosing = mode === "close" || closesWithEvent;

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

  // Same pattern as interview_type above, for the denied reason select
  // (KODI-014): seed "unknown" the moment event_type becomes "denied" so a
  // save with the select left untouched still carries a valid default.
  useEffect(() => {
    if (isDenied && !form.getValues("denied_reason")) {
      form.setValue("denied_reason", DEFAULT_DENIED_REASON, {
        shouldValidate: false,
      });
    }
  }, [isDenied, form]);

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
    toast.error(
      isClosing
        ? "Please fix the highlighted fields before closing"
        : "Please fix the highlighted fields before saving",
    );
  };

  const closeWith = (values: TimelineEventCloseValues) => {
    finalizeApplication.mutate(
      { applicationId, payload: toFinalizeOutcomePayload(values) },
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

  const onValid = (values: TimelineEventFormValues) => {
    if (
      values.event_type === "none" ||
      (values.event_type !== "interview" &&
        (mode === "close" || (mode === "create" && values.close_application)))
    ) {
      closeWith(values);
      return;
    }

    // A non-interview event never sends a schedule — the payload builder
    // needs only the current form values, not the original stored event; see
    // the schema module's doc comment.
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
    <Form {...form}>
      <TimelineEventDialog
        open={open}
        onOpenChange={onOpenChange}
        mode={mode}
        footer={
          <>
            {showsCloseBox ? (
              <FormField
                control={form.control}
                name="close_application"
                render={({ field }) => (
                  <FormItem className="basis-full grid-cols-[auto_1fr] items-center gap-y-0.5 sm:mr-auto sm:basis-auto">
                    <FormControl>
                      <Checkbox
                        ref={field.ref}
                        name={field.name}
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        onBlur={field.onBlur}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormLabel>Close the application</FormLabel>
                    <FormDescription className="col-start-2">
                      You can reopen it later.
                    </FormDescription>
                  </FormItem>
                )}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              {FINALIZE_DIALOG_COPY.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} disabled={isSaving}>
              {mode === "close" ? (
                <>
                  {isSaving ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Save aria-hidden />
                  )}
                  {FINALIZE_DIALOG_COPY.submit}
                </>
              ) : isSaving ? (
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
        <form id={FORM_ID} onSubmit={onSubmit} noValidate>
          <TimelineEventFormFields
            isInterview={isInterview}
            isOffer={isOffer}
            isDenied={isDenied}
            typeField={
              <FormField
                control={form.control}
                name="event_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {mode === "close"
                        ? FINALIZE_DIALOG_COPY.outcomeLabel
                        : "Event type"}
                    </FormLabel>
                    <FormControl>
                      <EventTypeSelector
                        value={field.value}
                        onValueChange={field.onChange}
                        options={
                          mode === "close" ? CLOSE_TYPE_OPTIONS : undefined
                        }
                        showHint={mode === "close"}
                        label={
                          mode === "close"
                            ? FINALIZE_DIALOG_COPY.outcomeLabel
                            : undefined
                        }
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
                          (field.value as DeniedReason) || DEFAULT_DENIED_REASON
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
              isNone ? null : (
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
                          maxDate={closesWithEvent ? new Date() : undefined}
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
              )
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
                    <FormLabel>{TIMEZONE_COPY.label}</FormLabel>
                    <FormControl>
                      <TimezoneSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSaving}
                        aria-invalid={Boolean(form.formState.errors.timezone)}
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
              isNone ? null : (
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
              )
            }
          />
        </form>
      </TimelineEventDialog>
    </Form>
  );
}
