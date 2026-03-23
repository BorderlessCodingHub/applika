"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { DatePickerInput } from "../ui/date-picker";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const schema = z.object({
  step_id: z.string().min(1, "Final step is required"),
  feedback_id: z.string().min(1, "Feedback is required"),
  finalize_date: z.string().min(1, "Date is required"),
  salary_offer: z.string().optional(),
  observation: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

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
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      step_id: "",
      feedback_id: "",
      finalize_date: format(new Date(), "yyyy-MM-dd"),
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

  const onSubmit = (data: FormValues) => {
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
            <Label>Final Step *</Label>
            <Select
              value={watchStepId}
              onValueChange={(v) =>
                form.setValue("step_id", v, { shouldValidate: true })
              }
            >
              <SelectTrigger
                className={cn(
                  form.formState.errors.step_id &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              >
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
            {form.formState.errors.step_id && (
              <p className="text-xs text-destructive">
                {form.formState.errors.step_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Feedback *</Label>
            <Select
              value={watchFeedbackId}
              onValueChange={(v) =>
                form.setValue("feedback_id", v, { shouldValidate: true })
              }
            >
              <SelectTrigger
                className={cn(
                  form.formState.errors.feedback_id &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              >
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
            {form.formState.errors.feedback_id && (
              <p className="text-xs text-destructive">
                {form.formState.errors.feedback_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Date *</Label>
            <DatePickerInput
              value={form.watch("finalize_date")}
              onChange={(date) =>
                form.setValue("finalize_date", date ? date : "", {
                  shouldValidate: true,
                })
              }
              className={cn(
                form.formState.errors.finalize_date &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {form.formState.errors.finalize_date && (
              <p className="text-xs text-destructive">
                {form.formState.errors.finalize_date.message}
              </p>
            )}
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
