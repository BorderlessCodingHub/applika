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
import { mutateApplications } from "../hooks/useApplications";
import { finalizeApplication } from "../services/applicationsService";

interface FinalizeApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedbacks: { id: string; name: string }[];
  results: { id: string; name: string }[];
  loadingFeedbacks?: boolean;
  loadingResults?: boolean;
  onSubmit: (payload: FinalizeApplicationPayload) => Promise<void>;
}

export default function FinalizeApplicationModal({
  isOpen,
  onClose,
  feedbacks,
  results,
  loadingFeedbacks = false,
  loadingResults = false,
  onSubmit,
}: FinalizeApplicationModalProps) {
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
    try {
      console.log(data);
      await onSubmit(data);
      await mutateApplications();
      onClose();
    } catch (err) {
      console.error("Error finalizing application:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalBase isOpen={isOpen} title="Finalize Application" onClose={onClose}>
      {/* ensure form wraps ModalFooter so the submit button triggers handleSubmit */}
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
          <Controller
            control={control}
            name="step_id"
            render={({ field }) => (
              <div className="relative">
                <ListBoxSelect
                  value={results.find((r) => r.id === field.value) ?? null}
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={results}
                  placeholder="Select Result"
                  loading={results.length === 0 || loadingResults}
                  disabled={results.length === 0 || loadingResults}
                />
                {(results.length === 0 || loadingResults) && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                    <i className="fa-solid fa-spinner" />
                  </div>
                )}
              </div>
            )}
          />

          <Controller
            control={control}
            name="feedback_id"
            render={({ field }) => (
              <div className="relative">
                <ListBoxSelect
                  value={feedbacks.find((f) => f.id === field.value) ?? null}
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={feedbacks}
                  placeholder="Select Feedback"
                  loading={feedbacks.length === 0 || loadingFeedbacks}
                  disabled={feedbacks.length === 0 || loadingFeedbacks}
                />
                {(feedbacks.length === 0 || loadingFeedbacks) && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                    <i className="fa-solid fa-spinner" />
                  </div>
                )}
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
          loading={isSubmitting}
          disabled={isSubmitting}
          submitType="submit"
        />
      </form>
    </ModalBase>
  );
}
