"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ModalWithSkeleton from "@/components/ui/ModalWithSkeleton";
import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";

import {
  addStepPayloadSchema,
  type AddStepPayload,
} from "../schemas/applicationsStepsSchema";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  steps: { id: number; name: string }[];
  loadingSteps?: boolean;
  applicationId: string;
  applicationInfo?: string;
  onSuccess?: () => Promise<void> | void;
  loading?: boolean;
}

export default function AddStepModal({
  isOpen,
  onClose,
  steps,
  loadingSteps = false,
  applicationId,
  applicationInfo = "",
  onSuccess,
  loading = false,
}: Props) {
  const { register, handleSubmit, control, reset, formState } =
    useForm<AddStepPayload>({
      resolver: zodResolver(addStepPayloadSchema),
      defaultValues: useMemo(
        () => ({ step_id: 0, step_date: "", observation: "" }),
        []
      ),
    });

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const onFormSubmit = async (data: AddStepPayload) => {
    await onSuccess?.(data);
  };

  return (
    <ModalWithSkeleton
      isOpen={isOpen}
      title={`Add Step — ${applicationInfo}`}
      onClose={onClose}
      loading={loadingSteps}
      numFields={2}
      showTextarea
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="step_id"
            render={({ field }) => (
              <div className="relative">
                <ListBoxSelect
                  value={
                    steps.find((s) => s.id === Number(field.value)) ?? null
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
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white"
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
          submitLabel="Add Step"
          loading={formState.isSubmitting || loading}
          disabled={formState.isSubmitting || loading}
        />
      </form>
    </ModalWithSkeleton>
  );
}
