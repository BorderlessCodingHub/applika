"use client";

import { useEffect } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalBase from "@/components/ui/ModalBase";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import ModalFooter from "@/components/ui/ModalFooter";

import {
  finalizeApplicationSchema,
  type FinalizeApplicationPayload,
} from "../schemas/applications/finalizeApplicationSchema";
import ModalSkeleton from "@/components/ui/ModalSkeleton";

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

  if (!isOpen) return null;

  const safeResults = results ?? [];
  const safeFeedbacks = feedbacks ?? [];

  return (
    <ModalBase isOpen={isOpen} title="Finalize Application" onClose={onClose}>
      {loadingResults || loadingFeedbacks ? (
        <ModalSkeleton numFields={2} showTextarea={true} />
      ) : (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
            <Controller
              control={control}
              name="step_id"
              render={({ field }) => (
                <div className="relative">
                  <ListBoxSelect
                    value={
                      safeResults.find((r) => r.id === String(field.value)) ??
                      null
                    }
                    onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                    options={safeResults}
                    placeholder="Select Result"
                  />
                </div>
              )}
            />

            <Controller
              control={control}
              name="feedback_id"
              render={({ field }) => (
                <div className="relative">
                  <ListBoxSelect
                    value={
                      safeFeedbacks.find((f) => f.id === String(field.value)) ??
                      null
                    }
                    onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                    options={safeFeedbacks}
                    placeholder="Select Feedback"
                  />
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
            <input
              {...register("finalize_date")}
              type="date"
              className="w-4/5 md:w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
            />
            <input
              {...register("salary_offer")}
              type="number"
              placeholder="Salary Offer (optional)"
              className="w-4/5 md:w-3/5 h-10 px-4 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60"
            />
          </div>

          <textarea
            {...register("observation")}
            rows={3}
            placeholder="Final notes"
            className="w-4/5 h-[150px] px-4 py-3 border border-white/30 rounded-lg bg-transparent text-white placeholder-white/60 resize-none"
          />

          <ModalFooter
            onCancel={onClose}
            submitLabel="Finalize Application"
            loading={isSubmitting || loading}
            disabled={isSubmitting || loading}
            submitType="submit"
          />
        </form>
      )}
    </ModalBase>
  );
}
