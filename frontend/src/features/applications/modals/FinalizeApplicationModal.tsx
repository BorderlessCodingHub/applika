"use client";

import { useEffect } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalWithSkeleton from "@/components/ui/ModalWithSkeleton";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import ModalFooter from "@/components/ui/ModalFooter";

import {
  finalizeApplicationSchema,
  type FinalizeApplicationPayload,
} from "../schemas/applications/finalizeApplicationSchema";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  applicationId?: string;
  feedbacks?: { id: string; name: string }[];
  results?: { id: string; name: string }[];
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
    formState: { isSubmitting },
  } = useForm<FinalizeApplicationPayload>({
    resolver: zodResolver(finalizeApplicationSchema),
    defaultValues: {
      step_id: 0,
      feedback_id: 0,
      finalize_date: "",
      salary_offer: undefined,
      observation: "",
    },
  });

  useEffect(() => {
    if (isOpen) reset();
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
              <div className="w-full">
                <ListBoxSelect
                  value={
                    safeResults.find((r) => r.id === String(field.value)) ??
                    null
                  }
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={safeResults}
                  placeholder="Select Result"
                  className="w-full"
                />
              </div>
            )}
          />

          <Controller
            control={control}
            name="feedback_id"
            render={({ field }) => (
              <div className="w-full">
                <ListBoxSelect
                  value={
                    safeFeedbacks.find((f) => f.id === String(field.value)) ??
                    null
                  }
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={safeFeedbacks}
                  placeholder="Select Feedback"
                  className="w-full"
                />
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("finalize_date")}
            type="date"
            className="w-full h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
          />
          <input
            {...register("salary_offer")}
            type="number"
            placeholder="Salary Offer (optional)"
            className="w-full h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
          />
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
