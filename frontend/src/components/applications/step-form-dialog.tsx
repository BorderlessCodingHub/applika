"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
  Application,
  ApplicationStep,
} from "@/services/types/applications";
import type { Step } from "@/services/types/supports";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";
import { genApplicationStepIcsFile } from "@/lib/calendar";
import { DatePickerInput } from "../ui/date-picker";
import {
  useApplicationStepMutate,
  useApplicationSteps,
} from "@/hooks/use-application-steps";
import { parse } from "date-fns";
import { TimezoneCombobox } from "./timezone-combo-box";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const schema = z
  .object({
    step_id: z.string().min(1, "Step is required"),
    step_date: z.string().min(1, "Date is required"),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    timezone: z.string().optional(),
    observation: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.start_time && !TIME_REGEX.test(d.start_time)) return false;
      if (d.end_time && !TIME_REGEX.test(d.end_time)) return false;
      return true;
    },
    { message: "Invalid time format (HH:MM)", path: ["start_time"] },
  )
  .refine(
    (d) => {
      if (d.start_time && d.end_time) return d.end_time > d.start_time;
      return true;
    },
    { message: "End time must be after start time", path: ["end_time"] },
  );

type FormData = z.infer<typeof schema>;

interface Props {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  editStep?: ApplicationStep;
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function buildDefaultFormValues(
  editStep: ApplicationStep | undefined,
): FormData {
  return {
    step_id: editStep?.step_id ?? "",
    step_date: editStep?.step_date ?? "",
    start_time: editStep?.start_time ?? "",
    end_time: editStep?.end_time ?? "",
    timezone: editStep?.timezone ?? getUserTimezone(),
    observation: editStep?.observation ?? "",
  };
}

function getLastPickedDate(
  application: Application,
  isEditing: boolean,
  applicationSteps: ApplicationStep[],
): string {
  if (isEditing) return application.application_date;

  const lastStep = applicationSteps.at(-1);
  return lastStep ? lastStep.step_date : application.application_date;
}

function getStepDateRange(
  application: Application,
  step: ApplicationStep | undefined,
  steps: ApplicationStep[],
) {
  const parseDate = (date: string): Date =>
    parse(date, "yyyy-MM-dd", new Date());
  if (!steps.length) {
    return {
      minDate: parseDate(application.application_date),
      maxDate: undefined,
    };
  }

  // 🆕 Modo criação (novo step)
  if (!step) {
    const lastStep = steps[steps.length - 1];

    return {
      minDate: lastStep
        ? parseDate(lastStep.step_date)
        : parseDate(application.application_date),
      maxDate: undefined,
    };
  }

  // 🔍 Encontrar índice diretamente
  const index = steps.findIndex((s) => s.id === step.id);

  if (index === -1) {
    return {
      minDate: parseDate(application.application_date),
      maxDate: undefined,
    };
  }

  const previous = steps[index - 1];
  const next = steps[index + 1];

  return {
    minDate: previous
      ? parseDate(previous.step_date)
      : parseDate(application.application_date),
    maxDate: next ? parseDate(next.step_date) : undefined,
  };
}


export function ApplicationStepFormDialog({
  application,
  open,
  onOpenChange,
  steps,
  editStep,
}: Props) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultFormValues(editStep),
  });
  const { steps: applicationSteps, isLoading } = useApplicationSteps(
    application.id,
  );

  const { submit, isPending } = useApplicationStepMutate({
    applicationId: application.id,
    applicationStepId: editStep ? editStep.id : undefined,
    onSuccess: () => {
      toast.success("Step updated");
      onOpenChange(false);
    },
  });

  const watchStepId = useWatch({ control: form.control, name: "step_id" });
  const watchStepDate = useWatch({ control: form.control, name: "step_date" });

  function handleCalendarClick() {
    const stepId = form.getValues("step_id");
    const stepDate = form.getValues("step_date");
    const startTime = form.getValues("start_time");
    const endTime = form.getValues("end_time");
    const timezone = form.getValues("timezone");
    const stepName = steps.find((s) => s.id === stepId)?.name ?? "Step";
    genApplicationStepIcsFile(stepDate, stepName, application, {
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      timezone: timezone || undefined,
    });
    toast.success("Calendar event downloaded");
  }

  async function handleFormSubmit(data: FormData) {
    await submit({
      ...data,
      start_time: data.start_time || undefined,
      end_time: data.end_time || undefined,
      timezone: data.timezone || undefined,
      observation: data.observation || undefined,
    });
  }

  if (isLoading) return null;

  const { minDate: minPickableDate, maxDate: maxPickableDate } =
    getStepDateRange(application, editStep, applicationSteps);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{!!editStep ? "Edit Step" : "Add Step"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="mt-2 space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Step *</Label>
            <Select
              value={watchStepId ? String(watchStepId) : ""}
              onValueChange={(v) =>
                form.setValue("step_id", v, { shouldValidate: true })
              }
            >
              <SelectTrigger
                className={cn(
                  form.formState.errors.step_id &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder="Select step" />
              </SelectTrigger>
              <SelectContent>
                {steps.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.step_id && (
              <p className="text-xs text-destructive">
                {form.formState.errors.step_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Date *</Label>
            <DatePickerInput
              value={form.watch("step_date")}
              minDate={minPickableDate}
              maxDate={maxPickableDate ? new Date(maxPickableDate) : undefined}
              onChange={(date) =>
                form.setValue("step_date", date ? date : "", {
                  shouldValidate: true,
                })
              }
              className={cn(
                form.formState.errors.step_date &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {form.formState.errors.step_date && (
              <p className="text-xs text-destructive">
                {form.formState.errors.step_date.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="step-start-time">Start Time</Label>
              <input
                id="step-start-time"
                type="time"
                step="60"
                value={form.watch("start_time") ?? ""}
                onChange={(e) =>
                  form.setValue("start_time", e.target.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
                  form.formState.errors.start_time &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {form.formState.errors.start_time && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.start_time.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="step-end-time">End Time</Label>
              <input
                id="step-end-time"
                type="time"
                step="60"
                value={form.watch("end_time") ?? ""}
                onChange={(e) =>
                  form.setValue("end_time", e.target.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
                  form.formState.errors.end_time &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {form.formState.errors.end_time && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.end_time.message}
                </p>
              )}
            </div>
          </div>

          <TimezoneCombobox
            value={form.watch("timezone") || getUserTimezone()}
            onChange={(v) =>
              form.setValue("timezone", v, { shouldValidate: true })
            }
          />

          <div className="space-y-1.5">
            <Label>Observation</Label>
            <Textarea {...form.register("observation")} rows={2} />
          </div>
          
          <div className="grid gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={!watchStepId || !watchStepDate}
              onClick={handleCalendarClick}
            >
              <CalendarPlus className="mr-1 h-4 w-4" />
              Add to calendar (.ics)
            </Button>

            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!!editStep ? "Save Changes" : "Add Step"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
