"use client";

import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { services } from "@/container/services";
import type { Step, Feedback } from "@/services/types/supports";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

interface Props {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  feedbacks: Feedback[];
}

export function FinalizeDialog({
  applicationId,
  open,
  onOpenChange,
  steps,
  feedbacks,
}: Props) {
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: {
      step_id: "",
      feedback_id: "",
      finalize_date: new Date().toISOString().split("T")[0],
      salary_offer: "",
      observation: "",
    },
  });

  const watchStepId = useWatch({ control: form.control, name: "step_id" });
  const watchFeedbackId = useWatch({
    control: form.control,
    name: "feedback_id",
  });

  const mutation = useMutation({
    mutationFn: (data: {
      step_id: string;
      feedback_id: string;
      finalize_date: string;
      salary_offer?: number;
      observation?: string;
    }) => services.applications.finalizeApplication(applicationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      toast.success("Application finalized");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to finalize"),
  });

  const onSubmit = (data: {
    step_id: string;
    feedback_id: string;
    finalize_date: string;
    salary_offer: string;
    observation: string;
  }) => {
    mutation.mutate({
      step_id: data.step_id,
      feedback_id: data.feedback_id,
      finalize_date: data.finalize_date,
      salary_offer: data.salary_offer ? Number(data.salary_offer) : undefined,
      observation: data.observation || undefined,
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Finalize Application</AlertDialogTitle>
          <AlertDialogDescription className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            This action is irreversible. Once finalized, this application cannot
            be edited.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label>Final Step</Label>
            <Select
              value={watchStepId}
              onValueChange={(v) => form.setValue("step_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
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
          </div>
          <div className="space-y-1.5">
            <Label>Feedback</Label>
            <Select
              value={watchFeedbackId}
              onValueChange={(v) => form.setValue("feedback_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {feedbacks.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: f.color }}
                      />
                      {f.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" {...form.register("finalize_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Salary Offer</Label>
            <Input
              type="number"
              {...form.register("salary_offer")}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observation</Label>
            <Textarea {...form.register("observation")} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Finalize
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
