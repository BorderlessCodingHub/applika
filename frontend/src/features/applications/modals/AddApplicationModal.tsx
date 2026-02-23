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
import type { SubmitHandler } from "react-hook-form";
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
    formState: { isSubmitting, errors },
  } = useForm<CreateApplicationPayload>({
    resolver: zodResolver(
      createApplicationSchema
    ) as unknown as Resolver<CreateApplicationPayload>,
    defaultValues: useMemo(
      () => ({
        company: "",
        role: "",
        application_date: "",
        platform_id: 0,
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
          platform_id: 0,
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
          <div className="flex flex-col gap-1">
            <input
              {...register("company")}
              type="text"
              placeholder="Company (required)"
              aria-invalid={errors.company ? "true" : "false"}
              aria-describedby={errors.company ? "company-error" : undefined}
              className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.company ? "border-red-400" : "border-white/30"
                         }`}
            />
            {errors.company?.message && (
              <span id="company-error" className="text-xs text-red-400" role="alert">
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
              aria-describedby={errors.role ? "role-error" : undefined}
              className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.role ? "border-red-400" : "border-white/30"
                         }`}
            />
            {errors.role?.message && (
              <span id="role-error" className="text-xs text-red-400" role="alert">
                {errors.role.message}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <DateInput
            {...register("application_date")}
            placeholder="Select date (required)"
            error={errors.application_date?.message}
            errorId="application-date-error"
            aria-invalid={errors.application_date ? "true" : "false"}
            aria-describedby={errors.application_date ? "application-date-error" : undefined}
          />

          <div className="flex flex-col gap-1">
            <Controller
              control={control}
              name="platform_id"
              render={({ field }) => (
                <ListBoxSelect
                  value={
                    platforms.find((p) => Number(p.id) === field.value) ?? null
                  }
                  onChange={(val) =>
                    field.onChange(val?.id ? Number(val.id) : 0)
                  }
                  options={platforms}
                  placeholder={
                    platforms.length === 0
                      ? "Loading platforms..."
                      : "Select Platform (required)"
                  }
                  loading={platforms.length === 0}
                  disabled={platforms.length === 0}
                  error={Boolean(errors.platform_id)}
                  ariaInvalid={Boolean(errors.platform_id)}
                  ariaDescribedBy={
                    errors.platform_id ? "platform-id-error" : undefined
                  }
                />
              )}
            />
            {errors.platform_id?.message && (
              <span
                id="platform-id-error"
                className="text-xs text-red-400"
                role="alert"
              >
                {errors.platform_id.message}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
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
                  error={Boolean(errors.mode)}
                  ariaInvalid={Boolean(errors.mode)}
                  ariaDescribedBy={errors.mode ? "mode-error" : undefined}
                />
              )}
            />
            {errors.mode?.message && (
              <span id="mode-error" className="text-xs text-red-400" role="alert">
                {errors.mode.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              {...register("expected_salary", { valueAsNumber: true })}
              type="number"
              placeholder="Expected Salary (optional)"
              aria-invalid={errors.expected_salary ? "true" : "false"}
              aria-describedby={
                errors.expected_salary ? "expected-salary-error" : undefined
              }
              className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.expected_salary
                             ? "border-red-400"
                             : "border-white/30"
                         }`}
            />
            {errors.expected_salary?.message && (
              <span
                id="expected-salary-error"
                className="text-xs text-red-400"
                role="alert"
              >
                {errors.expected_salary.message}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <input
              {...register("salary_range_min", { valueAsNumber: true })}
              type="number"
              placeholder="Salary Range Min (optional)"
              aria-invalid={errors.salary_range_min ? "true" : "false"}
              aria-describedby={
                errors.salary_range_min ? "salary-range-min-error" : undefined
              }
              className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.salary_range_min
                             ? "border-red-400"
                             : "border-white/30"
                         }`}
            />
            {errors.salary_range_min?.message && (
              <span
                id="salary-range-min-error"
                className="text-xs text-red-400"
                role="alert"
              >
                {errors.salary_range_min.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              {...register("salary_range_max", { valueAsNumber: true })}
              type="number"
              placeholder="Salary Range Max (optional)"
              aria-invalid={errors.salary_range_max ? "true" : "false"}
              aria-describedby={
                errors.salary_range_max ? "salary-range-max-error" : undefined
              }
              className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.salary_range_max
                             ? "border-red-400"
                             : "border-white/30"
                         }`}
            />
            {errors.salary_range_max?.message && (
              <span
                id="salary-range-max-error"
                className="text-xs text-red-400"
                role="alert"
              >
                {errors.salary_range_max.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <input
            {...register("link_to_job")}
            type="text"
            placeholder="Link to Job (optional)"
            aria-invalid={errors.link_to_job ? "true" : "false"}
            aria-describedby={errors.link_to_job ? "link-to-job-error" : undefined}
            className={`w-full h-10 px-4 py-2 border rounded-lg bg-transparent text-white 
                         placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all ${
                           errors.link_to_job ? "border-red-400" : "border-white/30"
                         }`}
          />
          {errors.link_to_job?.message && (
            <span id="link-to-job-error" className="text-xs text-red-400" role="alert">
              {errors.link_to_job.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <textarea
            {...register("observation")}
            rows={3}
            placeholder="Observation (optional)"
            aria-invalid={errors.observation ? "true" : "false"}
            aria-describedby={errors.observation ? "observation-error" : undefined}
            className={`w-full rounded-md border bg-transparent px-4 py-2 text-white 
                     placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none ${
                       errors.observation ? "border-red-400" : "border-white/30"
                     }`}
          />
          {errors.observation?.message && (
            <span id="observation-error" className="text-xs text-red-400" role="alert">
              {errors.observation.message}
            </span>
          )}
        </div>

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
