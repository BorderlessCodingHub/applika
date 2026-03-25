"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { services } from "@/services/services";
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
import { Input } from "@/components/ui/input";
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

export function ApplicationStepFormDialog({
  application,
  open,
  onOpenChange,
  steps,
  editStep,
}: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!editStep;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editStep
      ? {
          step_id: editStep.step_id,
          step_date: editStep.step_date,
          observation: editStep.observation ?? "",
        }
      : { step_id: "", step_date: "", observation: "" },
  });

  const addMutation = useMutation({
    mutationFn: (data: FormData) =>
      services.applications.addStep(application.id, {
        step_id: data.step_id,
        step_date: data.step_date,
        observation: data.observation,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({
        queryKey: ["applications", application.id, "steps"],
      });
      toast.success("Step added");
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to add step"),
  });

  const editMutation = useMutation({
    mutationFn: (data: FormData) =>
      services.applications.updateStep(application.id, editStep!.id, {
        step_id: data.step_id,
        step_date: data.step_date,
        observation: data.observation,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({
        queryKey: ["applications", application.id, "steps"],
      });
      toast.success("Step updated");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to update step"),
  });

  const mutation = isEditing ? editMutation : addMutation;

  const watchStepId = useWatch({ control: form.control, name: "step_id" });
  const watchStepDate = useWatch({ control: form.control, name: "step_date" });

  function handleCalendarClick() {
    const stepId = form.getValues("step_id");
    const stepDate = form.getValues("step_date");
    const stepName = steps.find((s) => s.id === stepId)?.name ?? "Step";
    genApplicationStepIcsFile(stepDate, stepName, application);
    toast.success("Calendar event downloaded");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Step" : "Add Step"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
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

            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Add Step"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
