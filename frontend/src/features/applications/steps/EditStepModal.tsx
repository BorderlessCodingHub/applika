// src/features/applications/steps/EditStepModal.tsx
"use client";

import React, { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";

const editStepSchema = z.object({
  id: z.number().int().positive(),
  step_id: z.number().int().positive(),
  step_date: z.string().min(1),
  observation: z.string().optional(),
});
export type EditStepForm = z.infer<typeof editStepSchema>;

interface StepOption {
  id: number | string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  steps: StepOption[];
  loadingSteps?: boolean;
  applicationId: string;
  initialData: {
    id: number;
    step_id: number;
    step_name?: string;
    step_date?: string;
    observation?: string;
  };
  onSubmit: (payload: {
    applicationId: string;
    data: EditStepForm;
  }) => Promise<void> | void;
  loading?: boolean;
}

export default function EditStepModal({
  isOpen,
  onClose,
  steps,
  loadingSteps = false,
  applicationId,
  initialData,
  onSubmit,
  loading = false,
}: Props) {
  const {
    handleSubmit,
    control,
    register,
    reset,
    formState: { isSubmitting },
  } = useForm<EditStepForm>({
    resolver: zodResolver(editStepSchema),
    defaultValues: {
      id: initialData.id ?? 0,
      step_id: initialData.step_id ?? 0,
      step_date: initialData.step_date ?? "",
      observation: initialData.observation ?? "",
    },
  });

  useEffect(() => {
    if (isOpen && initialData) {
      reset({
        id: initialData.id,
        step_id: initialData.step_id,
        step_date: initialData.step_date ?? "",
        observation: initialData.observation ?? "",
      });
    }
  }, [isOpen, initialData, reset]);

  const onFormSubmit = async (data: EditStepForm) => {
    await onSubmit({ applicationId, data });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalBase isOpen={isOpen} title="Edit Step" onClose={onClose}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="step_id"
            render={({ field }) => (
              <div className="relative">
                <ListBoxSelect
                  value={
                    steps.find((s) => String(s.id) === String(field.value)) ??
                    null
                  }
                  onChange={(val) => field.onChange(val ? Number(val.id) : 0)}
                  options={steps.map((s) => ({
                    id: String(s.id),
                    name: s.name,
                  }))}
                  placeholder="Select Step"
                  loading={loadingSteps}
                  disabled={loadingSteps || steps.length === 0}
                />
                {(loadingSteps || steps.length === 0) && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                    <i className="fa-solid fa-spinner" />
                  </div>
                )}
              </div>
            )}
          />

          <input
            {...register("step_date")}
            type="date"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white focus:outline-none"
            aria-label="Step date"
          />
        </div>

        <textarea
          {...register("observation")}
          rows={3}
          placeholder="Observation (optional)"
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white"
        />

        <ModalFooter
          onCancel={onClose}
          submitLabel="Save Changes"
          loading={isSubmitting || loading}
          disabled={isSubmitting || loading}
        />
      </form>
    </ModalBase>
  );
}
