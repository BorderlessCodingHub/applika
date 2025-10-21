"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ModalBase from "@/components/ui/ModalBase";
import ModalFooter from "@/components/ui/ModalFooter";
import ListBoxSelect from "@/components/ui/ListBoxSelect";

import {
  updateApplicationSchema,
  type UpdateApplicationPayload,
} from "../schemas/applications/updateApplicationSchema";
import type { Application } from "../types";
import { updateApplication } from "../services/applicationsService";
import { mutateApplications } from "../hooks/useApplications";

interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: { id: string; name: string }[];
  loadingPlatforms?: boolean;
  initialData?: Partial<Application>;
  onSubmit: (data: UpdateApplicationPayload) => void;
}

const MODES = [
  { id: "active", name: "Active" },
  { id: "passive", name: "Passive" },
];

export default function EditApplicationModal({
  isOpen,
  onClose,
  platforms = [],
  loadingPlatforms = false,
  initialData,
  onSubmit,
}: EditApplicationModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<UpdateApplicationPayload>({
    resolver: zodResolver(updateApplicationSchema),
    defaultValues: useMemo(
      () => ({
        company: initialData?.company ?? "",
        role: initialData?.role ?? "",
        application_date: initialData?.application_date ?? "",
        platform_id: initialData?.platform_id?.toString() ?? "",
        mode: initialData?.mode ?? "",
        expected_salary: initialData?.expected_salary ?? undefined,
        salary_range_min: initialData?.salary_range_min ?? undefined,
        salary_range_max: initialData?.salary_range_max ?? undefined,
        observation: initialData?.observation ?? "",
      }),
      [initialData]
    ),
  });

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen && initialData) {
      reset({
        company: initialData.company ?? "",
        role: initialData.role ?? "",
        application_date: initialData.application_date ?? "",
        platform_id: initialData.platform_id?.toString() ?? "",
        mode: initialData.mode ?? "",
        expected_salary: initialData.expected_salary ?? undefined,
        salary_range_min: initialData.salary_range_min ?? undefined,
        salary_range_max: initialData.salary_range_max ?? undefined,
        observation: initialData.observation ?? "",
      });
    }
  }, [isOpen, initialData, reset]);

  const onFormSubmit = async (data: UpdateApplicationPayload) => {
    try {
      if (!initialData?.id) return;

      // Parse numeric fields
      const payload = {
        ...data,
        platform_id: data.platform_id ? Number(data.platform_id) : undefined,
      };

      await updateApplication(initialData.id, payload);
      await mutateApplications(); // global cache update
      onSubmit(payload);
      onClose();
    } catch (err) {
      console.error("Error updating application:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalBase isOpen={isOpen} title="Edit Application" onClose={onClose}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        {/* Company & Role */}
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

        {/* Date & Platform */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <input
            {...register("application_date")}
            type="date"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />

          <Controller
            control={control}
            name="platform_id"
            render={({ field }) => (
              <div className="relative">
                <ListBoxSelect
                  value={
                    platforms.find((p) => p.id === field.value) ?? null
                  }
                  onChange={(val) => field.onChange(val?.id ?? "")}
                  options={platforms}
                  placeholder="Select Platform"
                  loading={loadingPlatforms}
                  disabled={platforms.length === 0 || loadingPlatforms}
                />
                {(platforms.length === 0 || loadingPlatforms) && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/50 pointer-events-none">
                    <i className="fa-solid fa-spinner" />
                  </div>
                )}
              </div>
            )}
          />
        </div>

        {/* Mode & Expected Salary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <ListBoxSelect
                value={MODES.find((m) => m.id === field.value) ?? null}
                onChange={(val) => field.onChange(val?.id ?? "")}
                options={MODES}
                placeholder="Select Mode"
                loading={false}
              />
            )}
          />

          <input
            {...register("expected_salary")}
            type="number"
            placeholder="Expected Salary (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        {/* Salary Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            {...register("salary_range_min")}
            type="number"
            placeholder="Salary Range Min (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
          <input
            {...register("salary_range_max")}
            type="number"
            placeholder="Salary Range Max (optional)"
            className="w-full h-10 px-4 py-2 border border-white/30 rounded-lg bg-transparent text-white 
                       placeholder-white/60 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
          />
        </div>

        {/* Observation */}
        <textarea
          {...register("observation")}
          rows={3}
          placeholder="Observation (optional)"
          className="w-full rounded-md border border-white/30 bg-transparent px-4 py-2 text-white 
                     placeholder-white/60 focus:border-white/50 focus:bg-white/10 focus:outline-none"
        />

        <ModalFooter
          onCancel={onClose}
          loading={isSubmitting}
          submitLabel="Save Changes"
          cancelLabel="Cancel"
          disabled={isSubmitting}
        />
      </form>
    </ModalBase>
  );
}
