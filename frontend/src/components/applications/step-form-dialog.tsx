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

const schema = z.object({
  step_id: z.string().min(1, "Step is required"),
  step_date: z.string().min(1, "Date is required"),
  observation: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  editStep?: ApplicationStep;
}

function buildDefaultFormValues(
  editStep: ApplicationStep | undefined,
): FormData {
  return {
    step_id: editStep?.step_id ?? "",
    step_date: editStep?.step_date ?? "",
    observation: editStep?.observation ?? "",
  };
}

function getLastPickedDate(
  application: Application,
  applicationSteps: ApplicationStep[],
): string {
  const lastStep = applicationSteps.at(-1);
  return lastStep ? lastStep.step_date : application.application_date;
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
    const stepName = steps.find((s) => s.id === stepId)?.name ?? "Step";
    genApplicationStepIcsFile(stepDate, stepName, application);
    toast.success("Calendar event downloaded");
  }

  async function handleFormSubmit(data: FormData) {
    await submit(data);
  }

  if (isLoading) return null;

  const minPickableDate = new Date(
    getLastPickedDate(application, applicationSteps),
  );

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
