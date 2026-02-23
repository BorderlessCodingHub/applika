"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ModalWithSkeleton from "@/components/ui/ModalWithSkeleton";
import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";
import DateInput from "@/components/ui/DateInput";
import type { Resolver } from "react-hook-form";

import {
  updateApplicationSchema,
  type UpdateApplicationPayload,
} from "../schemas/applications/updateApplicationSchema";
import type { Application, Option } from "../types";
import { APPLICATION_MODES } from "@/domain/constants/application";

interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: number; name: string }[];
  loadingPlatforms?: boolean;
  loading?: boolean;
  initialData?: Partial<Application>;
  onSubmit: (data: Partial<UpdateApplicationPayload>) => void;
}

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms = [],
  loadingPlatforms = false,
  loading = false,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<UpdateApplicationPayload>({
    resolver: zodResolver(
      updateApplicationSchema
    ) as unknown as Resolver<UpdateApplicationPayload>,
    defaultValues: useMemo(
      () => ({
        company: initialData?.company ?? "",
        role: initialData?.role ?? "",
        application_date: initialData?.application_date ?? "",
        platform_id: initialData?.platform_id ?? undefined,
        mode: initialData?.mode,
        expected_salary: initialData?.expected_salary ?? undefined,
        salary_range_min: initialData?.salary_range_min ?? undefined,
        salary_range_max: initialData?.salary_range_max ?? undefined,
        link_to_job: initialData?.link_to_job ?? "",
        observation: initialData?.observation ?? "",
      }),
      [initialData]
    ),
  });

  useEffect(() => {
    if (isOpen && initialData) {
      reset({
        company: initialData.company ?? "",
        role: initialData.role ?? "",
        application_date: initialData.application_date ?? "",
        platform_id: initialData?.platform_id ?? undefined,
        mode: initialData?.mode,
        expected_salary: initialData.expected_salary ?? undefined,
        salary_range_min: initialData.salary_range_min ?? undefined,
        salary_range_max: initialData.salary_range_max ?? undefined,
        link_to_job: initialData.link_to_job ?? "",
        observation: initialData.observation ?? "",
      });
    }
  }, [isOpen, initialData, reset]);

  const onFormSubmit = async (data: UpdateApplicationPayload) => {
    await onSubmit?.(data);
  };

  return (
    <ModalWithSkeleton
      isOpen={isOpen}
      title="Edit Application"
      onClose={onClose}
      loading={loadingPlatforms}
      numFields={8}
      showTextarea
    >
      {initialData && (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <input
                {...register("company")}
                type="text"
                placeholder="Company (required)"
                aria-invalid={errors.company ? "true" : "false"}
                aria-describedby={errors.company ? "edit-company-error" : undefined}
                className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                         errors.company ? "border-red-400" : "border-white/30"
                       }`}
              />
              {errors.company?.message && (
                <span id="edit-company-error" className="text-xs text-red-400" role="alert">
                  {errors.company.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                {...register("role")}
                type="text"
                placeholder="Role (required)"
                aria-invalid={errors.role ? "true" : "false"}
                aria-describedby={errors.role ? "edit-role-error" : undefined}
                className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                         errors.role ? "border-red-400" : "border-white/30"
                       }`}
              />
              {errors.role?.message && (
                <span id="edit-role-error" className="text-xs text-red-400" role="alert">
                  {errors.role.message}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
            <DateInput
              {...register("application_date")}
              placeholder="Select date"
              error={errors.application_date?.message}
              errorId="edit-application-date-error"
              aria-invalid={errors.application_date ? "true" : "false"}
              aria-describedby={
                errors.application_date ? "edit-application-date-error" : undefined
              }
            />

            <Controller
              control={control}
              name="platform_id"
              render={({ field }) => (
                <div className="relative">
                  <ListBoxSelect
                    value={
                      platforms.find((p) => Number(p.id) === field.value) ??
                      null
                    }
                    onChange={(val) =>
                      field.onChange(val?.id ? Number(val.id) : undefined)
                    }
                    options={platforms}
                    placeholder="Select Platform"
                    loading={loadingPlatforms}
                    disabled={platforms.length === 0 || loadingPlatforms}
                    error={Boolean(errors.platform_id)}
                    ariaInvalid={Boolean(errors.platform_id)}
                    ariaDescribedBy={
                      errors.platform_id ? "edit-platform-id-error" : undefined
                    }
                  />
                  {(platforms.length === 0 || loadingPlatforms) && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                      <i className="fa-solid fa-spinner" />
                    </div>
                  )}
                  {errors.platform_id?.message && (
                    <span
                      id="edit-platform-id-error"
                      className="text-xs text-red-400"
                      role="alert"
                    >
                      {errors.platform_id.message}
                    </span>
                  )}
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <ListBoxSelect
                    value={
                      APPLICATION_MODES.find((m) => m.id === field.value) ?? null
                    }
                    onChange={(val) => field.onChange(val?.id ?? undefined)}
                    options={[...APPLICATION_MODES] satisfies Option[]}
                    placeholder="Select Mode"
                    loading={false}
                    error={Boolean(errors.mode)}
                    ariaInvalid={Boolean(errors.mode)}
                    ariaDescribedBy={errors.mode ? "edit-mode-error" : undefined}
                  />
                  {errors.mode?.message && (
                    <span id="edit-mode-error" className="text-xs text-red-400" role="alert">
                      {errors.mode.message}
                    </span>
                  )}
                </div>
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
            submitLabel="Save Changes"
            cancelLabel="Cancel"
            loading={isSubmitting || loading}
            disabled={isSubmitting || loading}
          />
        </form>
      )}
    </ModalWithSkeleton>
  );
}
