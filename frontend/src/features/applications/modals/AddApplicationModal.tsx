"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import DateInput from "@/components/ui/DateInput";

import {
  createApplicationSchema,
  type CreateApplicationPayload,
} from "../schemas/applications/createApplicationSchema";
import ModalWithSkeleton from "@/components/ui/ModalWithSkeleton";
import type { SubmitHandler, UseFormHandleSubmit } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { APPLICATION_MODES } from "@/domain/constants/application";
import type { Option } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: number; name: string }[];
  loadingPlatforms?: boolean;
  loading?: boolean;
  onSubmit?: (payload: CreateApplicationPayload) => Promise<void> | void;
}

export default function AddApplicationModal({
  isOpen,
  onClose,
  platforms,
  onSubmit,
  loadingPlatforms = false,
  loading = false,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateApplicationPayload>({
    resolver: zodResolver(
      createApplicationSchema
    ) as unknown as Resolver<CreateApplicationPayload>,
    defaultValues: useMemo(
      () => ({
        company: "",
        role: "",
        application_date: "",
        platform_id: undefined,
        mode: undefined,
        expected_salary: undefined,
        salary_range_min: undefined,
        salary_range_max: undefined,
        link_to_job: "",
        observation: "",
      }),
      []
    ),
  });

  useEffect(() => {
    if (!isOpen)
      reset({
        company: "",
        role: "",
        application_date: "",
        platform_id: undefined,
        mode: undefined,
        expected_salary: undefined,
        salary_range_min: undefined,
        salary_range_max: undefined,
        link_to_job: "",
        observation: "",
      });
  }, [isOpen, reset]);

  const onFormSubmit: SubmitHandler<CreateApplicationPayload> = async (
    data
  ) => {
    await onSubmit?.(data);
    onClose();
  };
  return (
    <ModalWithSkeleton
      isOpen={isOpen}
      title="Add New Application"
      onClose={onClose}
      loading={loadingPlatforms}
      numFields={8}
      showTextarea
    >
      <form className="space-y-4" onSubmit={handleSubmit(onFormSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("company")}
            type="text"
            placeholder="Company (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            {...register("role")}
            type="text"
            placeholder="Role (required)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <DateInput
            {...register("application_date")}
            placeholder="Select date (required)"
          />

          <Controller
            control={control}
            name="platform_id"
            render={({ field }) => (
              <ListBoxSelect
                value={
                  platforms.find((p) => Number(p.id) === field.value) ?? null
                }
                onChange={(val) =>
                  field.onChange(val?.id ? Number(val.id) : undefined)
                }
                options={platforms}
                placeholder={
                  platforms.length === 0
                    ? "Loading platforms..."
                    : "Select Platform (required)"
                }
                loading={platforms.length === 0}
                disabled={platforms.length === 0}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <ListBoxSelect
                value={
                  APPLICATION_MODES.find((m) => m.id === field.value) ?? null
                }
                onChange={(val) => field.onChange(val?.id ?? undefined)}
                options={[...APPLICATION_MODES] satisfies Option[]}
                placeholder="Select Mode (required)"
              />
            )}
          />
          <input
            {...register("expected_salary", { valueAsNumber: true })}
            type="number"
            placeholder="Expected Salary (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("salary_range_min", { valueAsNumber: true })}
            type="number"
            placeholder="Salary Range Min (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            {...register("salary_range_max", { valueAsNumber: true })}
            type="number"
            placeholder="Salary Range Max (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        <input
          {...register("link_to_job")}
          type="text"
          placeholder="Link to Job (optional)"
          className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
        />

        <textarea
          {...register("observation")}
          rows={3}
          placeholder="Observation (optional)"
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white 
                     placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
        />

        <ModalFooter
          onCancel={onClose}
          submitLabel="Create Application"
          loading={isSubmitting || loading}
          disabled={isSubmitting || loading || platforms.length === 0}
        />
      </form>
    </ModalWithSkeleton>
  );
}
