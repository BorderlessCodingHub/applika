"use client";

import { useEffect } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalWithSkeleton from "@/components/ui/ModalWithSkeleton";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import ModalFooter from "@/components/ui/ModalFooter";
import DateInput from "@/components/ui/DateInput";

import {
  finalizeApplicationSchema,
  type FinalizeApplicationPayload,
} from "../schemas/applications/finalizeApplicationSchema";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  applicationId?: string;
  feedbacks?: { id: number; name: string }[];
  results?: { id: number; name: string }[];
  loadingFeedbacks?: boolean;
  loadingResults?: boolean;
  onSubmit?: (payload: FinalizeApplicationPayload) => Promise<void> | void;
  loading?: boolean;
}

export default function FinalizeApplicationModal({
  isOpen,
  onClose,
  applicationId,
  feedbacks,
  results,
  loadingFeedbacks = false,
  loadingResults = false,
  onSubmit,
  loading = false,
}: Props) {
  const {
    handleSubmit,
    control,
    register,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FinalizeApplicationPayload>({
    resolver: zodResolver(
      finalizeApplicationSchema
    ) as unknown as Resolver<FinalizeApplicationPayload>,
    defaultValues: {
      step_id: 0,
      feedback_id: 0,
      finalize_date: "",
      salary_offer: undefined,
      observation: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        step_id: 0,
        feedback_id: 0,
        finalize_date: "",
        salary_offer: undefined,
        observation: "",
      });
    }
  }, [isOpen, reset]);

  const onFormSubmit: SubmitHandler<FinalizeApplicationPayload> = async (
    data
  ) => {
    await onSubmit?.(data);
  };

  const safeResults = results ?? [];
  const safeFeedbacks = feedbacks ?? [];

  return (
    <ModalWithSkeleton
      isOpen={isOpen}
      title="Finalize Application"
      onClose={onClose}
      loading={loadingResults || loadingFeedbacks}
      numFields={4}
      showTextarea
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="step_id"
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                <ListBoxSelect
                  value={
                    safeResults.find((r) => Number(r.id) === field.value) ?? null
                  }
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={safeResults}
                  placeholder="Select Result"
                  className="w-full"
                  error={Boolean(errors.step_id)}
                  ariaInvalid={Boolean(errors.step_id)}
                  ariaDescribedBy={errors.step_id ? "finalize-step-id-error" : undefined}
                />
                {errors.step_id?.message && (
                  <span
                    id="finalize-step-id-error"
                    className="text-xs text-red-400"
                    role="alert"
                  >
                    {errors.step_id.message}
                  </span>
                )}
              </div>
            )}
          />

          <Controller
            control={control}
            name="feedback_id"
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                <ListBoxSelect
                  value={
                    safeFeedbacks.find((f) => Number(f.id) === field.value) ??
                    null
                  }
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={safeFeedbacks}
                  placeholder="Select Feedback"
                  className="w-full"
                  error={Boolean(errors.feedback_id)}
                  ariaInvalid={Boolean(errors.feedback_id)}
                  ariaDescribedBy={
                    errors.feedback_id ? "finalize-feedback-id-error" : undefined
                  }
                />
                {errors.feedback_id?.message && (
                  <span
                    id="finalize-feedback-id-error"
                    className="text-xs text-red-400"
                    role="alert"
                  >
                    {errors.feedback_id.message}
                  </span>
                )}
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DateInput
            {...register("finalize_date")}
            placeholder="Select date"
            error={errors.finalize_date?.message}
            errorId="finalize-date-error"
            aria-invalid={errors.finalize_date ? "true" : "false"}
            aria-describedby={errors.finalize_date ? "finalize-date-error" : undefined}
          />

          <div className="flex flex-col gap-1">
            <input
              {...register("salary_offer", { valueAsNumber: true })}
              type="number"
              placeholder="Salary Offer (optional)"
              aria-invalid={errors.salary_offer ? "true" : "false"}
              aria-describedby={errors.salary_offer ? "salary-offer-error" : undefined}
              className={`w-full h-10 px-4 border rounded-lg bg-transparent text-white placeholder-white/60 ${
                errors.salary_offer ? "border-red-400" : "border-white/30"
              }`}
            />
            {errors.salary_offer?.message && (
              <span id="salary-offer-error" className="text-xs text-red-400" role="alert">
                {errors.salary_offer.message}
              </span>
            )}
          </div>
        </div>

        <textarea
          {...register("observation")}
          rows={3}
          placeholder="Final notes"
          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 resize-none"
        />

        <ModalFooter
          onCancel={onClose}
          submitLabel="Finalize Application"
          loading={isSubmitting || loading}
          disabled={isSubmitting || loading}
          submitType="submit"
        />
      </form>
    </ModalWithSkeleton>
  );
}
